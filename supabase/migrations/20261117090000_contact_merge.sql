-- Merging contacts (#27): two contacts of the same person become one. Everything that points to the dropped contact
-- moves to the kept one, chosen fields come from the dropped one, the dropped one goes to the trash.
-- Possible duplicates = same first + last name (case and spaces ignored); email is unique per org anyway.

-- Issued invoices are frozen; only a merge may move their (internal) contact link. The printed recipient stays.
create or replace function public.documents_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (
    (new.kind, new.number, case when current_setting('roots.merging', true) = 'on' then old.contact_id else new.contact_id end,
     new.title, new.recipient_name, new.recipient_address, new.recipient_email,
     new.recipient_vat_id, new.issue_date, new.service_from, new.service_to, new.due_date, new.valid_until, new.intro,
     new.outro, new.tax_mode, new.currency, new.net_total, new.tax_total, new.gross_total, new.seller, new.issued_at, new.prices_gross)
    is distinct from
    (old.kind, old.number, old.contact_id, old.title, old.recipient_name, old.recipient_address, old.recipient_email,
     old.recipient_vat_id, old.issue_date, old.service_from, old.service_to, old.due_date, old.valid_until, old.intro,
     old.outro, old.tax_mode, old.currency, old.net_total, old.tax_total, old.gross_total, old.seller, old.issued_at, old.prices_gross)
  ) then raise exception 'document_locked'; end if;
  if old.status = 'draft' and new.status <> 'draft' and current_setting('roots.issuing', true) is distinct from 'on' then
    raise exception 'document_locked';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and current_setting('roots.cancelling', true) is distinct from 'on' then
    raise exception 'use_cancellation';
  end if;
  if old.status <> new.status and not (
    (old.status = 'draft') or
    (new.kind = 'invoice' and old.status = 'sent' and new.status in ('paid', 'cancelled')) or
    (new.kind = 'invoice' and old.status = 'paid' and new.status in ('sent', 'cancelled')) or
    (new.kind = 'quote' and old.status = 'sent' and new.status in ('accepted', 'declined')) or
    (new.kind = 'quote' and old.status in ('accepted', 'declined') and new.status = 'sent')
  ) then raise exception 'invalid_status'; end if;
  if new.status = 'paid' and old.status <> 'paid' then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  if new.status = 'cancelled' then new.cancelled_at := now(); end if;
  return new;
end $$;

-- A merge moves many rows; those changes must not start record-trigger workflows (mails to the person …).
create or replace function public.workflow_runs_from_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record; v_type text := 'record:' || new.table_name || ':' || new.action;
begin
  if new.org_id is null or new.table_name in ('workflows', 'workflow_runs', 'audit_log')
    or coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-roots-workflow', '') <> ''
    or current_setting('roots.merging', true) = 'on'
    or not exists (select 1 from public.workflows where org_id = new.org_id and trigger_type = v_type and active and deleted_at is null) then
    return null;
  end if;
  for w in select id from public.workflows where org_id = new.org_id and trigger_type = v_type and active and deleted_at is null loop
    insert into public.workflow_runs (org_id, workflow_id, contact_id, context)
    values (new.org_id, w.id,
      case when new.table_name = 'contacts' and new.row_id ~ '^[0-9a-f-]{36}$' and new.action <> 'delete' then new.row_id::uuid end,
      jsonb_build_object('event', v_type, 'payload', jsonb_build_object(
        'id', new.row_id,
        'changed', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(case when new.action = 'update' then coalesce(new.new, '{}') else '{}' end) k))));
  end loop;
  return null;
end $$;

-- p_take: fields whose value comes from the dropped contact: first_name, last_name, company, email, phone,
-- address (street + postal code + city + country), birthday, member_code (the member card), user_id, custom.<key>.
-- Always: tags united (the kept spelling wins, max 50), an unsubscribe on either stays.
create function public.merge_contacts(p_keep uuid, p_drop uuid, p_take text[] default '{}', p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k public.contacts; d public.contacts; v_take text[] := coalesce(p_take, '{}');
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
  -- Both in the same course: attendance moves to the kept participation where it has none, then the double goes.
  update public.course_attendance a set participant_id = kp.id
    from public.course_participants dp join public.course_participants kp on kp.course_id = dp.course_id and kp.contact_id = p_keep
   where dp.contact_id = p_drop and a.participant_id = dp.id
     and not exists (select 1 from public.course_attendance x where x.session_id = a.session_id and x.participant_id = kp.id);
  delete from public.course_participants dp where dp.contact_id = p_drop
    and exists (select 1 from public.course_participants kp where kp.course_id = dp.course_id and kp.contact_id = p_keep);
  update public.course_participants set contact_id = p_keep where contact_id = p_drop;
  delete from public.rental_contacts dr where dr.contact_id = p_drop
    and exists (select 1 from public.rental_contacts kr where kr.rental_id = dr.rental_id and kr.contact_id = p_keep);
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
  return p_keep;
end $$;

-- What hangs on a contact (for the merge preview): counts per kind.
create function public.contact_refs(p_contact uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (select org_id from public.contacts where id = p_contact);
begin
  if v_org is null or not public.has_perm(v_org, 'crm.view') then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'memberships', (select count(*) from public.memberships where contact_id = p_contact),
    'tickets', (select count(*) from public.tickets where contact_id = p_contact),
    'notes', (select count(*) from public.contact_notes where contact_id = p_contact),
    'files', (select count(*) from public.files where org_id = v_org and entity = 'contacts' and entity_id = p_contact),
    'documents', (select count(*) from public.documents where contact_id = p_contact),
    'shop_orders', (select count(*) from public.shop_orders where contact_id = p_contact),
    'form_submissions', (select count(*) from public.form_submissions where contact_id = p_contact),
    'courses', (select count(*) from public.course_participants where contact_id = p_contact),
    'rentals', (select count(*) from public.rental_contacts where contact_id = p_contact),
    'email_sends', (select count(*) from public.email_sends where contact_id = p_contact),
    'cash_entries', (select count(*) from public.cash_entries where contact_id = p_contact),
    'artists', (select count(*) from public.artists where contact_id = p_contact),
    'staff', (select count(*) from public.staff where contact_id = p_contact));
end $$;

-- Possible duplicates of an org: pairs of live contacts with the same first + last name. Runs as the caller (RLS).
create index contacts_org_fullname on public.contacts (org_id,
  lower(regexp_replace(btrim(last_name), '\s+', ' ', 'g')), lower(regexp_replace(btrim(first_name), '\s+', ' ', 'g')))
  where deleted_at is null;
create function public.contact_duplicates(p_org uuid, p_limit int default 50, p_offset int default 0)
returns table (a_id uuid, b_id uuid) language sql stable security invoker set search_path = '' as $$
  select a.id, b.id
    from public.contacts a
    join public.contacts b on b.org_id = a.org_id and b.deleted_at is null and b.id > a.id
     and lower(regexp_replace(btrim(b.last_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(a.last_name), '\s+', ' ', 'g'))
     and lower(regexp_replace(btrim(b.first_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(a.first_name), '\s+', ' ', 'g'))
   where a.org_id = p_org and a.deleted_at is null and btrim(a.first_name) <> '' and btrim(a.last_name) <> ''
   order by lower(btrim(a.last_name)), lower(btrim(a.first_name)), a.id, b.id
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;

revoke execute on function public.merge_contacts(uuid, uuid, text[], text) from public, anon;
revoke execute on function public.contact_refs(uuid) from public, anon;
revoke execute on function public.contact_duplicates(uuid, int, int) from public, anon;
grant execute on function public.merge_contacts(uuid, uuid, text[], text) to authenticated, service_role;
grant execute on function public.contact_refs(uuid) to authenticated, service_role;
grant execute on function public.contact_duplicates(uuid, int, int) to authenticated, service_role;
