-- Link bookings to auth user when the guest email matches the logged-in account (stronger than email-only RLS).
-- Tighten booking insert so guest_user_id cannot be forged for another user.

alter table public.bookings
  add column if not exists guest_user_id uuid references auth.users(id) on delete set null;

create index if not exists bookings_guest_user_id_idx on public.bookings(guest_user_id)
  where guest_user_id is not null;

comment on column public.bookings.guest_user_id is 'Set when booking is created by/for a logged-in traveler whose email matches guest_email; used for RLS alongside guest_email.';

drop policy if exists "Anyone can create bookings" on public.bookings;

create policy "Anyone can create bookings"
  on public.bookings for insert
  with check (
    guest_user_id is null
    or guest_user_id = auth.uid()
  );

drop policy if exists "Consumers can view own bookings by user id" on public.bookings;
create policy "Consumers can view own bookings by user id"
  on public.bookings for select
  using (auth.uid() is not null and guest_user_id = auth.uid());

drop policy if exists "Consumers can cancel own bookings by user id" on public.bookings;
create policy "Consumers can cancel own bookings by user id"
  on public.bookings for update
  using (auth.uid() is not null and guest_user_id = auth.uid())
  with check (auth.uid() is not null and guest_user_id = auth.uid());

create or replace function public.update_guest_booking_special_requests(
  p_booking_id uuid,
  p_special_requests text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_uid uuid := auth.uid();
begin
  if (v_email = '' or v_email is null) and v_uid is null then
    return false;
  end if;
  update public.bookings
  set special_requests = left(trim(p_special_requests), 8000)
  where id = p_booking_id
    and status in ('pending', 'confirmed')
    and (
      (length(v_email) > 0 and lower(trim(coalesce(guest_email, ''))) = v_email)
      or (v_uid is not null and guest_user_id = v_uid)
    );
  return FOUND;
end;
$$;

-- Case-insensitive email match for legacy rows (guest_user_id null) and mixed-case JWT / form data.
drop policy if exists "Consumers can view own bookings" on public.bookings;

create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists "Consumers can cancel own bookings" on public.bookings;

create policy "Consumers can cancel own bookings"
  on public.bookings for update
  using (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
  with check (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
