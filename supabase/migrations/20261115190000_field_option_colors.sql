-- Colours for the options of select fields ({ "Party": "green" }), e.g. an event "Typ" coloured in the calendar.
alter table public.custom_fields add column option_colors jsonb not null default '{}' check (jsonb_typeof(option_colors) = 'object');
