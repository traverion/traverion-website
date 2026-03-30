-- Default experience start time on listings; per-booking start and pickup times.
-- Pickup window = how many minutes before start pickup may occur (supplier assigns exact pickup_time after booking).

alter table public.listings
  add column if not exists default_start_time time,
  add column if not exists pickup_window_minutes_before_min integer not null default 0,
  add column if not exists pickup_window_minutes_before_max integer not null default 30;

comment on column public.listings.default_start_time is 'Local start time of the experience on each booked day (e.g. 18:30).';
comment on column public.listings.pickup_window_minutes_before_min is 'Pickup may be from this many minutes before start (inclusive).';
comment on column public.listings.pickup_window_minutes_before_max is 'Pickup may be up to this many minutes before start (inclusive).';

alter table public.bookings
  add column if not exists start_time time,
  add column if not exists pickup_time time;

comment on column public.bookings.start_time is 'Confirmed start time for this instance (local); copied from listing default on insert when null.';
comment on column public.bookings.pickup_time is 'Assigned pickup time for the guest (local); set by supplier after booking, within listing pickup window.';

create or replace function public.bookings_set_default_start_time()
returns trigger
language plpgsql
as $$
begin
  if new.start_time is null and new.listing_id is not null then
    select l.default_start_time into new.start_time
    from public.listings l
    where l.id = new.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_set_default_start_time_trigger on public.bookings;
create trigger bookings_set_default_start_time_trigger
  before insert on public.bookings
  for each row
  execute function public.bookings_set_default_start_time();
