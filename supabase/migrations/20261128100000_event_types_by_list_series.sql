-- Which events count towards a visit limit is now a list of event types on the membership type (null = every event),
-- replacing the custom-field rule of 20261124120000 (only a Domes test type had one). Event types lose their defaults (capacity) and
-- slug: a type is a label (name, colour, active). Locations get a capacity that new events copy, events a series marker.
-- The old columns go in 20261128110000 (after the App stopped using them).

alter table public.membership_types add column visit_event_types uuid[] check (cardinality(visit_event_types) > 0);

-- The listed types must belong to the membership type's org.
create or replace function public.membership_type_visit_types() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.visit_event_types is not null and exists (
    select 1 from unnest(new.visit_event_types) v(id)
    where not exists (select 1 from public.event_types t where t.id = v.id and t.org_id = new.org_id)
  ) then
    raise exception 'invalid_input';
  end if;
  return new;
end $$;
revoke execute on function public.membership_type_visit_types() from public, anon, authenticated;
create trigger membership_types_visit_types before insert or update of visit_event_types on public.membership_types
  for each row execute function public.membership_type_visit_types();

-- A type a membership type counts can't be deleted (events already block it through their FK): same error code as the FK,
-- so the App and the API answer "in use" for both. Deleting the whole org (cascade) is not blocked.
create or replace function public.event_type_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.orgs where id = old.org_id)
     and exists (select 1 from public.membership_types where org_id = old.org_id and old.id = any(visit_event_types)) then
    raise foreign_key_violation using message = 'type_in_use';
  end if;
  return old;
end $$;
revoke execute on function public.event_type_in_use() from public, anon, authenticated;
create trigger event_types_in_use before delete on public.event_types
  for each row execute function public.event_type_in_use();

-- Dropped in 20261128110000 once the App no longer reads them; until then new types are stored without a slug.
alter table public.event_types alter column slug drop not null;

alter table public.locations add column capacity int check (capacity >= 1);

-- Dates created together by "Wiederholen" share a series id; each stays a normal, independent event.
alter table public.events add column series_id uuid;
create index events_series on public.events (org_id, series_id, starts_at) where series_id is not null;

create or replace function public.member_door_rows(p_org uuid, p_event uuid, p_contact uuid default null) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select (now() at time zone 'Europe/Berlin')::date as d),
  cur as (
    select distinct on (x.contact_id) x.id, x.contact_id, x.member_no, x.starts_on, x.ends_on, x.paused_from, x.paused_until, y.name as type_name, y.visit_limit,
      y.visit_event_types
    from public.memberships x join public.membership_types y on y.id = x.type_id cross join t
    where x.org_id = p_org and x.deleted_at is null and (p_contact is null or x.contact_id = p_contact)
    order by x.contact_id, (x.starts_on <= t.d and (x.ends_on is null or x.ends_on >= t.d)) desc, x.starts_on desc),
  v as (
    select k.contact_id,
      count(*) filter (where (cur.visit_event_types is null or e.event_type_id = any(cur.visit_event_types))
                         and (k.checked_in_at at time zone 'Europe/Berlin')::date >= cur.starts_on) as n,
      max(k.checked_in_at) as last_visit, max(k.checked_in_at) filter (where k.event_id = p_event) as here
    from public.tickets k join public.ticket_types y on y.id = k.type_id
      join public.events e on e.id = k.event_id join cur on cur.contact_id = k.contact_id
    where k.org_id = p_org and y.for_members and k.status = 'used' and e.deleted_at is null and (p_contact is null or k.contact_id = p_contact)
    group by 1),
  d as (
    select u.membership_id, count(*) as n, sum(u.amount_cents) as cents
    from public.member_dues u cross join t
    where u.org_id = p_org and u.status = 'open' and u.due_on < t.d
    group by 1)
  select jsonb_build_object(
    'contact_id', c.id, 'code', c.member_code,
    'number', nullif(upper(regexp_replace(coalesce(cur.member_no, ''), '[^A-Za-z0-9]', '', 'g')), ''),
    'name', coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.company, c.email),
    'membership_id', cur.id, 'member_no', cur.member_no, 'type', cur.type_name,
    'state', case when cur.starts_on > t.d then 'upcoming' when cur.ends_on < t.d then 'ended' else 'active' end,
    'ends_on', cur.ends_on,
    'paused', coalesce(cur.paused_from <= t.d and (cur.paused_until is null or cur.paused_until >= t.d), false),
    'paused_until', cur.paused_until,
    'overdue_count', coalesce(d.n, 0), 'overdue_cents', coalesce(d.cents, 0),
    'visits', coalesce(v.n, 0), 'visit_limit', cur.visit_limit,
    -- no list: every event counts; with a list an event without a type does not count
    'event_counts', cur.visit_event_types is null
      or coalesce((select e.event_type_id = any(cur.visit_event_types) from public.events e where e.id = p_event), false),
    'last_visit', v.last_visit, 'checked_in_at', v.here)
  from cur join public.contacts c on c.id = cur.contact_id and c.deleted_at is null cross join t
  left join v on v.contact_id = c.id left join d on d.membership_id = cur.id;
$$;
