-- Merging contacts, follow-up (review of #27): when both contacts are in the same course, the better place stays
-- (the person keeps an enrolled place and nobody else moves up or gets mailed); when both are on the same rental,
-- a main tenant stays the main tenant. The merge switches its guard exceptions off again before it returns.

create or replace function public.merge_contacts(p_keep uuid, p_drop uuid, p_take text[] default '{}', p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k public.contacts; d public.contacts; v_take text[] := coalesce(p_take, '{}'); r record; v_win uuid; v_lose uuid; v_main uuid[];
begin
  if p_keep = p_drop then raise exception 'merge_same'; end if;
  select * into k from public.contacts where id = p_keep and deleted_at is null for update;
  select * into d from public.contacts where id = p_drop and deleted_at is null for update;
  if k.id is null or d.id is null or k.org_id <> d.org_id then raise exception 'merge_not_found'; end if;
  if not (public.module_enabled(k.org_id, 'crm') and public.has_perm(k.org_id, 'crm.manage'))
     or (exists (select 1 from public.memberships where contact_id = p_drop) and not public.has_perm(k.org_id, 'members.manage')) then
    raise exception 'not_allowed';
  end if;
  perform set_config('roots.merging', 'on', true);

  update public.memberships set contact_id = p_keep where contact_id = p_drop;
  update public.tickets set contact_id = p_keep where contact_id = p_drop;
  update public.contact_notes set contact_id = p_keep where contact_id = p_drop;
  update public.documents set contact_id = p_keep where contact_id = p_drop;
  update public.email_sends set contact_id = p_keep where contact_id = p_drop;
  update public.form_submissions set contact_id = p_keep where contact_id = p_drop;
  update public.shop_orders set contact_id = p_keep where contact_id = p_drop;
  update public.cash_entries set contact_id = p_keep where contact_id = p_drop;
  update public.workflow_runs set contact_id = p_keep where contact_id = p_drop;
  update public.artists set contact_id = p_keep where contact_id = p_drop;
  update public.staff set contact_id = p_keep where contact_id = p_drop;
  update public.files set entity_id = p_keep where org_id = k.org_id and entity = 'contacts' and entity_id = p_drop;
  delete from public.project_links l where l.entity = 'contacts' and l.entity_id = p_drop
    and exists (select 1 from public.project_links x where x.project_id = l.project_id and x.entity = 'contacts' and x.entity_id = p_keep);
  update public.project_links set entity_id = p_keep where org_id = k.org_id and entity = 'contacts' and entity_id = p_drop;
  -- Both in the same course: the better place stays (enrolled > waiting > cancelled), so the person keeps it and nobody
  -- else moves up; attendance joins it where it has none, the other participation goes.
  for r in select kp.id as k_id, kp.status as k_status, dp.id as d_id, dp.status as d_status
             from public.course_participants kp join public.course_participants dp on dp.course_id = kp.course_id and dp.contact_id = p_drop
            where kp.contact_id = p_keep loop
    if array_position(array['enrolled', 'waiting', 'cancelled'], r.d_status) < array_position(array['enrolled', 'waiting', 'cancelled'], r.k_status) then
      v_win := r.d_id; v_lose := r.k_id;
    else
      v_win := r.k_id; v_lose := r.d_id;
    end if;
    update public.course_attendance a set participant_id = v_win where a.participant_id = v_lose
      and not exists (select 1 from public.course_attendance x where x.session_id = a.session_id and x.participant_id = v_win);
    delete from public.course_participants where id = v_lose;
  end loop;
  update public.course_participants set contact_id = p_keep where contact_id = p_drop;
  -- Both on the same rental: the double goes, but a main tenant stays the main tenant.
  select array_agg(dr.rental_id) filter (where dr.role = 'main') into v_main from public.rental_contacts dr
   where dr.contact_id = p_drop and exists (select 1 from public.rental_contacts kr where kr.rental_id = dr.rental_id and kr.contact_id = p_keep);
  delete from public.rental_contacts dr where dr.contact_id = p_drop
    and exists (select 1 from public.rental_contacts kr where kr.rental_id = dr.rental_id and kr.contact_id = p_keep);
  update public.rental_contacts set role = 'main' where contact_id = p_keep and rental_id = any(coalesce(v_main, '{}'));
  update public.rental_contacts set contact_id = p_keep where contact_id = p_drop;
  delete from public.portal_tokens where contact_id = p_drop;

  -- Trash first, so the kept contact can take its email / login (unique among live rows); the card code is
  -- unique everywhere, so it is freed when taken.
  update public.contacts set deleted_at = now(),
    member_code = case when 'member_code' = any(v_take) then null else member_code end
  where id = p_drop;

  update public.contacts set
    first_name = case when 'first_name' = any(v_take) then d.first_name else k.first_name end,
    last_name = case when 'last_name' = any(v_take) then d.last_name else k.last_name end,
    company = case when 'company' = any(v_take) then d.company else k.company end,
    email = case when 'email' = any(v_take) then d.email else k.email end,
    phone = case when 'phone' = any(v_take) then d.phone else k.phone end,
    street = case when 'address' = any(v_take) then d.street else k.street end,
    postal_code = case when 'address' = any(v_take) then d.postal_code else k.postal_code end,
    city = case when 'address' = any(v_take) then d.city else k.city end,
    country = case when 'address' = any(v_take) then d.country else k.country end,
    birthday = case when 'birthday' = any(v_take) then d.birthday else k.birthday end,
    member_code = case when 'member_code' = any(v_take) then d.member_code else k.member_code end,
    user_id = case when 'user_id' = any(v_take) then d.user_id else k.user_id end,
    custom = k.custom || coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(d.custom) e where 'custom.' || e.key = any(v_take)), '{}'),
    tags = coalesce((select (array_agg(t order by o))[1:50] from (
      select distinct on (lower(t)) t, o
        from (select t, o from unnest(k.tags) with ordinality u(t, o) union all select t, o + 1000 from unnest(d.tags) with ordinality u(t, o)) x
       order by lower(t), o) y), '{}'),
    unsubscribed_at = least(k.unsubscribed_at, d.unsubscribed_at)
  where id = p_keep;

  if nullif(btrim(p_note), '') is not null then
    insert into public.contact_notes (org_id, contact_id, body) values (k.org_id, p_keep, left(p_note, 5000));
  end if;
  perform set_config('roots.merging', '', true); -- guards are back on for anything else in this transaction
  return p_keep;
end $$;
