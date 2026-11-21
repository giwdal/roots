-- Per event: offer the public waiting list when sold out (default on, as before). Off = the shop just says sold out,
-- joining is refused (also via the public API); people already on the list keep their place and offers.
alter table public.events add column waitlist boolean not null default true;
grant select (waitlist) on public.events to anon;
