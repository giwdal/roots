-- Second half of 20261128100000: the custom-field visit rule and the event type defaults/slug are no longer used.
alter table public.membership_types
  drop constraint membership_types_visit_rule,
  drop column visit_count_field,
  drop column visit_count_value;
drop trigger custom_fields_in_use on public.custom_fields;
drop function public.custom_field_in_use();
alter table public.event_types drop column slug, drop column capacity;
