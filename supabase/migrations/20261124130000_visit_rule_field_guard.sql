-- An event custom field that a membership type uses as its visit counting rule (membership_types.visit_count_field)
-- can't be deleted: the door would silently count no visit any more. Change or clear the rule first.
-- One trigger covers the App, the key API and any other path. Deleting the whole org (cascade) is not blocked.
create or replace function public.custom_field_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.entity = 'events'
     and exists (select 1 from public.orgs where id = old.org_id)
     and exists (select 1 from public.membership_types where org_id = old.org_id and visit_count_field = old.key) then
    raise exception 'field_in_use';
  end if;
  return old;
end $$;
revoke execute on function public.custom_field_in_use() from public, anon, authenticated;

create trigger custom_fields_in_use before delete on public.custom_fields
  for each row execute function public.custom_field_in_use();
