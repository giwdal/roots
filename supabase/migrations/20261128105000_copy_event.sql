-- Duplicate / repeat an event: one copy per start time, each a normal independent event (status draft or published,
-- new slug <base>-<date>). Copied: the event's settings, ticket types with tiers, guest lists (without guests; each list
-- gets its own ticket type through guest_lists_own_type, and links start closed). Not copied: tickets, orders, codes,
-- line-up, shifts, waiting list. Dates and sales windows move with the event. With p_series all copies and the source
-- share that series id (the source keeps an existing one).
create or replace function public.copy_event(p_event uuid, p_starts timestamptz[], p_series uuid default null, p_status text default 'draft')
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  src public.events; v_start timestamptz; v_d interval; v_id uuid; v_day text; v_slug text; v_base text; n int;
  v_out uuid[] := '{}'; tt record; v_tt uuid; v_map jsonb;
begin
  select * into src from public.events where id = p_event and deleted_at is null;
  if src.id is null or not public.module_enabled(src.org_id, 'events') or not public.has_perm(src.org_id, 'events.manage') then
    raise exception 'not_allowed';
  end if;
  if p_status not in ('draft', 'published') or coalesce(cardinality(p_starts), 0) not between 1 and 60 then
    raise exception 'invalid_input';
  end if;
  if p_series is not null then
    update public.events set series_id = p_series where id = src.id and series_id is null;
  end if;
  v_base := left(regexp_replace(src.slug, '-\d{4}-\d{2}-\d{2}(-\d+)?$', ''), 66);
  foreach v_start in array p_starts loop
    v_d := v_start - src.starts_at;
    v_day := to_char(v_start at time zone 'Europe/Berlin', 'YYYY-MM-DD');
    v_slug := v_base || '-' || v_day; n := 1;
    while exists (select 1 from public.events where org_id = src.org_id and slug = v_slug and deleted_at is null) loop
      n := n + 1; v_slug := v_base || '-' || v_day || '-' || n;
    end loop;
    insert into public.events (org_id, title, slug, status, starts_at, ends_at, venue_name, venue_address, description, image_path,
      capacity, ticket_names, max_tickets_per_order, location_id, custom, email_template_id, links, show_code_field, door,
      event_type_id, waitlist, series_id)
    values (src.org_id, src.title, v_slug, p_status, v_start, src.ends_at + v_d, src.venue_name, src.venue_address, src.description,
      src.image_path, src.capacity, src.ticket_names, src.max_tickets_per_order, src.location_id, src.custom, src.email_template_id,
      src.links, src.show_code_field, src.door, src.event_type_id, src.waitlist, coalesce(src.series_id, p_series))
    returning id into v_id;
    v_map := '{}';
    for tt in select * from public.ticket_types where event_id = src.id and guest_list_id is null order by position loop
      insert into public.ticket_types (org_id, event_id, name, description, price, currency, quota, sales_start, sales_end, position, active, hidden, for_members)
      values (tt.org_id, v_id, tt.name, tt.description, tt.price, tt.currency, tt.quota, tt.sales_start + v_d, tt.sales_end + v_d, tt.position, tt.active, tt.hidden, tt.for_members)
      returning id into v_tt;
      v_map := v_map || jsonb_build_object(tt.id::text, v_tt);
      insert into public.ticket_tiers (org_id, type_id, name, price, quota, sales_end, position)
        select org_id, v_tt, name, price, quota, sales_end + v_d, position from public.ticket_tiers where type_id = tt.id;
    end loop;
    insert into public.guest_lists (org_id, event_id, artist_id, name, door_price, quota, per_submission, ticket_type_id, notes, is_default, link_closes_at)
      select org_id, v_id, artist_id, name, door_price, quota, per_submission, (v_map ->> ticket_type_id::text)::uuid, notes, is_default, link_closes_at + v_d
      from public.guest_lists where event_id = src.id and deleted_at is null;
    v_out := v_out || v_id;
  end loop;
  return v_out;
end $$;
revoke execute on function public.copy_event(uuid, timestamptz[], uuid, text) from public, anon;
grant execute on function public.copy_event(uuid, timestamptz[], uuid, text) to authenticated, service_role;
