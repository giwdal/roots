-- Nobody is let in at a cancelled event. Enforced where a check-in is stored, so every way in is covered:
-- ticket scan (check_in_ticket), member check-in (member_door), door sales, guest lists, App and API.
create function public.no_checkin_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.events where id = new.event_id and status = 'cancelled') then
    raise exception 'event_cancelled';
  end if;
  return new;
end $$;
revoke execute on function public.no_checkin_cancelled() from public, anon, authenticated;

create trigger tickets_no_checkin_cancelled_ins before insert on public.tickets
  for each row when (new.checked_in_at is not null) execute function public.no_checkin_cancelled();
create trigger tickets_no_checkin_cancelled_upd before update of checked_in_at on public.tickets
  for each row when (old.checked_in_at is null and new.checked_in_at is not null) execute function public.no_checkin_cancelled();
create trigger guest_checkins_no_checkin_cancelled before insert on public.guest_checkins
  for each row execute function public.no_checkin_cancelled();
