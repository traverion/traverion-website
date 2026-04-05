-- Consumers can cancel their own bookings (update to status=cancelled)
-- Run after 005 (consumer select). Enables customer self-service cancellation.

drop policy if exists "Consumers can cancel own bookings" on public.bookings;
create policy "Consumers can cancel own bookings"
  on public.bookings for update
  using (
    auth.jwt() ->> 'email' is not null
    and guest_email = (auth.jwt() ->> 'email')
  )
  with check (
    auth.jwt() ->> 'email' is not null
    and guest_email = (auth.jwt() ->> 'email')
  );
