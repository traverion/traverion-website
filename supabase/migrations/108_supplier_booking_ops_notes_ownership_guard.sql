-- Phase 1017: close a cross-supplier authorization gap in
-- public.supplier_booking_ops_notes (migration 015) -- the exact
-- unreachable-from-UI-but-reachable-via-raw-API booking/listing ownership
-- gap this mission has already closed twice before, on
-- supplier_booking_vouchers (migration 099) and the original bookings
-- insert path (migration 086), but never applied to this table.
--
-- The original (015) INSERT and UPDATE policies on
-- public.supplier_booking_ops_notes only ever checked
-- `supplier_id = auth.uid()`. Neither ever checked that `booking_id` (the
-- table's primary key) actually references a booking on a listing that
-- supplier owns. Any authenticated user can set supplier_id to their own
-- uid (satisfying the only check) while pointing booking_id at ANY other
-- supplier's real booking -- via the standard anon-key + session
-- PostgREST path (src/data/supabase-booking-ops-notes.ts:
-- upsertSupplierBookingOpsNote passes booking_id straight through with no
-- other validation), no product UI involved. Concretely this lets an
-- attacking "supplier" plant an internal ops note on a competitor's
-- booking, or read/overwrite whatever they later plant there once they
-- know (or guess/enumerate) a booking id -- an ops-integrity and
-- competitor-visibility gap, not a payment/booking-state gap, but a real
-- authorization gap in the same family the mission's standing rule
-- requires closing regardless of live UI reachability.
--
-- Note src/data/supabase-booking-ops-notes.ts has zero callers anywhere in
-- src/ today (grepped: no .tsx imports fetchSupplierBookingOpsNotes /
-- upsertSupplierBookingOpsNote / deleteSupplierBookingOpsNote) -- same
-- "unreachable-from-UI but reachable via raw API" shape 099's own comment
-- describes for supplier_booking_vouchers.
--
-- Fix: require, in both the INSERT WITH CHECK and the UPDATE WITH CHECK,
-- that a booking exists whose id matches the row's booking_id AND whose
-- listing's supplier_id matches the row's own supplier_id. The UPDATE
-- USING clause (which rows an owner may act on at all) is left as
-- supplier_id = auth.uid() -- unchanged -- only the WITH CHECK (what the
-- row may become) is tightened, so a supplier can still update the note
-- text on their own existing, legitimately-owned rows without needing to
-- re-supply a passing booking. booking_id is this table's primary key, so
-- an UPDATE cannot really repoint it onto a different row's identity in
-- practice, but the same WITH CHECK is applied for defense in depth and
-- consistency with the 099 pattern, and is exercised by this migration's
-- own regression test.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- supplier_booking_ops_notes_ownership_guard.test.sql): the exploit (an
-- attacking supplier inserting an ops note against a victim supplier's
-- real booking) succeeds against 015 alone and is rejected after this
-- migration; a genuine same-supplier note insert/update/read/delete is
-- unaffected; and reverting the fix reopens the gap (mutation test).

drop policy if exists "Suppliers can upsert own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes
  for insert
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );

drop policy if exists "Suppliers can update own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can update own booking notes"
  on public.supplier_booking_ops_notes
  for update
  using (supplier_id = auth.uid())
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );

comment on table public.supplier_booking_ops_notes is
  'Supplier offline-safe ops notes per booking (sync target). RLS (108) requires booking_id, on insert or update, to reference a booking whose listing is owned by the row''s own supplier_id -- cannot be planted on or repointed to a different supplier''s booking.';
