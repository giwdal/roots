-- Automations add guests with added_via = 'automation'; the old check only allowed app/link/api.
alter table public.guest_entries drop constraint guest_entries_added_via_check;
alter table public.guest_entries add constraint guest_entries_added_via_check check (added_via in ('app', 'link', 'api', 'automation'));
