-- Visit limit, part 2: which events count is decided by the membership type, not by a switch on the event.
-- A type may say "count only events whose custom field <field> equals <value>" (events.custom ->> field = value); without
-- a rule every event counts. An event that lacks the key does not count. The door still reads only the row's
-- `event_counts`, `visits` and `visit_limit`, so tickets, door stats and the offline scanner don't change.
-- Replaces events.counts_visit and event_types.counts_visit (migrations 140000/150000/160000 stay as they are).
alter table public.membership_types
  add column visit_count_field text check (visit_count_field ~ '^[a-z][a-z0-9_]{0,39}$'),
  add column visit_count_value text check (length(visit_count_value) between 1 and 200),
  add constraint membership_types_visit_rule check ((visit_count_field is null) = (visit_count_value is null));

create or replace function public.member_door_rows(p_org uuid, p_event uuid, p_contact uuid default null) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select (now() at time zone 'Europe/Berlin')::date as d),
  cur as (
    select distinct on (x.contact_id) x.id, x.contact_id, x.member_no, x.starts_on, x.ends_on, x.paused_from, x.paused_until, y.name as type_name, y.visit_limit,
      y.visit_count_field, y.visit_count_value
    from public.memberships x join public.membership_types y on y.id = x.type_id cross join t
    where x.org_id = p_org and x.deleted_at is null and (p_contact is null or x.contact_id = p_contact)
    order by x.contact_id, (x.starts_on <= t.d and (x.ends_on is null or x.ends_on >= t.d)) desc, x.starts_on desc),
  v as (
    select k.contact_id,
      count(*) filter (where (cur.visit_count_field is null or coalesce(e.custom ->> cur.visit_count_field = cur.visit_count_value, false))
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
    -- no rule: every event counts; with a rule a missing key (null) must not count, so coalesce to false inside the rule branch
    'event_counts', case when cur.visit_count_field is null then true
      else coalesce((select e.custom ->> cur.visit_count_field = cur.visit_count_value from public.events e where e.id = p_event), false) end,
    'last_visit', v.last_visit, 'checked_in_at', v.here)
  from cur join public.contacts c on c.id = cur.contact_id and c.deleted_at is null cross join t
  left join v on v.contact_id = c.id left join d on d.membership_id = cur.id;
$$;

alter table public.events drop column counts_visit;
alter table public.event_types drop column counts_visit;
