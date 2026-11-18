-- Event types: every org defines its own (name, slug, colour) with defaults for new events. The defaults are copied into the
-- event when it is created (the event keeps its own values; the door etc. read only events.*), the type itself stays a label
-- for filters, colour and API. A composite FK keeps an event's type inside the event's org.
create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  name text not null check (length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  color text check (color in ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink')),
  active boolean not null default true,
  counts_visit boolean not null default true,  -- default for events.counts_visit
  capacity int check (capacity >= 1),          -- default for events.capacity (null = none)
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  unique (org_id, slug),
  unique (id, org_id)
);
select public.enable_audit('public.event_types');

alter table public.event_types enable row level security;
revoke all on public.event_types from anon;
create policy "members view event types" on public.event_types for select to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.view'));
create policy "managers add event types" on public.event_types for insert to authenticated
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));
create policy "managers edit event types" on public.event_types for update to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'))
  with check (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));
create policy "managers delete event types" on public.event_types for delete to authenticated
  using (public.module_enabled(org_id, 'events') and public.has_perm(org_id, 'events.manage'));

-- No ON DELETE action: a type still used by an event (also a trashed one) can't be deleted.
alter table public.events add column event_type_id uuid;
alter table public.events add constraint events_event_type foreign key (event_type_id, org_id) references public.event_types (id, org_id);
create index events_org_type on public.events (org_id, event_type_id);
