-- Searchable custom values: only text and numbers (yes/no fields made a search for "true" match everyone).
-- The column is dropped and added again so every stored value is computed with the new function.
alter table public.contacts drop column custom_search;

create or replace function public.custom_text(p jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    (select string_agg(e.value #>> '{}', ' ') from jsonb_each(p) e where jsonb_typeof(e.value) in ('string', 'number')) end
$$;

alter table public.contacts add column custom_search text generated always as (public.custom_text(custom)) stored;
