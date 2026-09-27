-- Phase 1018: close a cross-supplier authorization gap in
-- public.supplier_booking_events (migration 016) -- the same
-- unreachable-from-UI-but-reachable-via-raw-API booking ownership
-- gap closed on supplier_booking_vouchers (099) and
-- supplier_booking_ops_notes (108), but never applied to this table.
--
-- The original (016) INSERT policy on public.supplier_booking_events
-- only ever checked `supplier_id = auth.uid()`. It never checked that
-- `booking_id` references a booking on a listing that supplier owns.
-- Any authenticated user can set supplier_id to their own uid
-- (satisfying the only check) while pointing booking_id at ANY other
-- supplier's real booking -- via the standard anon-key + session
-- PostgREST path (src/data/supabase-booking-events.ts:
-- insertSupplierBookingEvent passes bookingId straight through with no
-- other validation). Concretely this lets an attacking "supplier"
-- plant timeline events (note / acknowledged / status_*) on a
-- competitor's booking -- an ops-integrity and competitor-visibility
-- gap in the same family the mission's standing rule requires closing
-- regardless of live UI reachability.
--
-- Fix: require, in the INSERT WITH CHECK, that a booking exists whose
-- id matches the row's booking_id AND whose listing's supplier_id
-- matches the row's own supplier_id. There is no UPDATE policy on this
-- table (events are append-only), so only INSERT is hardened.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- supplier_booking_events_ownership_guard.test.sql): the exploit
-- succeeds against 016 alone and is rejected after this migration; a
-- genuine same-supplier event insert/read is unaffected; and reverting
-- the fix reopens the gap (mutation test).

drop policy if exists "Suppliers can write own booking events" on public.supplier_booking_events;
create policy "Suppliers can write own booking events"
  on public.supplier_booking_events
  for insert
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_events.booking_id
        and l.supplier_id = supplier_booking_events.supplier_id
    )
  );

comment on table public.supplier_booking_events is
  'Supplier shared booking timeline events. RLS (109) requires booking_id, on insert, to reference a booking whose listing is owned by the row''s own supplier_id -- cannot be planted on a different supplier''s booking.';
