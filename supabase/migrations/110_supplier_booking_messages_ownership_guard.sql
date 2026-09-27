-- Phase 1019: close a cross-supplier authorization gap in
-- public.supplier_booking_messages (migration 016) -- the same
-- booking-ownership family closed for vouchers (099), ops notes (108),
-- and booking events (109), but never applied to this table's
-- booking_ids uuid[] column.
--
-- The original (016) INSERT policy only checked
-- `supplier_id = auth.uid()`. It never checked that every element of
-- `booking_ids` references a booking on a listing that supplier owns.
-- Any authenticated user can set supplier_id to their own uid while
-- stuffing competitor booking UUIDs into booking_ids -- via
-- src/data/supabase-booking-events.ts insertSupplierBookingMessage
-- (bookingIds passed straight through). That plants a communication
-- record that falsely associates the attacker with a competitor's
-- guests / bookings (ops-integrity / competitor-visibility).
--
-- Additionally, 016 shipped no UPDATE policy at all, so
-- updateSupplierBookingMessageDelivery (same module) cannot succeed
-- under RLS for an authenticated supplier. This migration adds an
-- UPDATE policy that (a) allows owners to update their own rows and
-- (b) re-checks booking_ids ownership on WITH CHECK so a delivery
-- update cannot repoint the array onto a competitor's bookings.
--
-- Empty booking_ids ('{}') remains allowed (campaign stubs / drafts
-- with no bookings selected yet). Non-empty arrays require EVERY
-- element to resolve to a booking whose listing.supplier_id matches
-- the row's supplier_id.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- supplier_booking_messages_ownership_guard.test.sql).

drop policy if exists "Suppliers can write own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages
  for insert
  with check (
    supplier_id = auth.uid()
    and (
      cardinality(coalesce(booking_ids, '{}'::uuid[])) = 0
      or not exists (
        select 1
        from unnest(booking_ids) as bid
        where not exists (
          select 1
          from public.bookings b
          join public.listings l on l.id = b.listing_id
          where b.id = bid
            and l.supplier_id = supplier_booking_messages.supplier_id
        )
      )
    )
  );

drop policy if exists "Suppliers can update own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can update own booking messages"
  on public.supplier_booking_messages
  for update
  using (supplier_id = auth.uid())
  with check (
    supplier_id = auth.uid()
    and (
      cardinality(coalesce(booking_ids, '{}'::uuid[])) = 0
      or not exists (
        select 1
        from unnest(booking_ids) as bid
        where not exists (
          select 1
          from public.bookings b
          join public.listings l on l.id = b.listing_id
          where b.id = bid
            and l.supplier_id = supplier_booking_messages.supplier_id
        )
      )
    )
  );

comment on table public.supplier_booking_messages is
  'Supplier outbound booking communication records. RLS (110) requires every booking_ids element, on insert or update, to reference a booking whose listing is owned by the row''s own supplier_id (empty arrays allowed).';
