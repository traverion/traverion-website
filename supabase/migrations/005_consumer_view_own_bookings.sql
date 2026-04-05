-- Consumers can view their own bookings (where guest_email = logged-in user email)
-- Run after 004

drop policy if exists "Consumers can view own bookings" on public.bookings;
create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    auth.jwt() ->> 'email' is not null
    and guest_email = (auth.jwt() ->> 'email')
  );
