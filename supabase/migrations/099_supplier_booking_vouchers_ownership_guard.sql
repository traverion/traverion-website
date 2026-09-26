-- Phase 595: close a cross-supplier authorization gap in
-- public.supplier_booking_vouchers -- a table for supplier-run booking
-- retention/recovery voucher campaigns (migration 018).
--
-- Both the INSERT policy ("Suppliers can write own vouchers") and the
-- UPDATE policy ("Suppliers can update own vouchers") only ever checked
-- `supplier_id = auth.uid()`. Neither checked that `booking_id` or
-- `listing_id` on the row actually belong to that supplier. Any
-- authenticated user can set supplier_id to their own uid (satisfying the
-- only check) while pointing booking_id/listing_id at ANY other
-- supplier's real booking/listing -- via the standard anon-key +
-- session PostgREST path, no product UI involved.
--
-- src/data/supabase-booking-vouchers.ts (insertSupplierBookingVouchers,
-- updateSupplierBookingVoucherStatus) has this exact shape and zero call
-- sites anywhere in src/ (grepped: "insertSupplierBookingVouchers" and
-- "updateSupplierBookingVoucherStatus" are both unreachable from the live
-- UI today, same "unreachable-from-UI but reachable via raw API" shape
-- Phase 563 (migration 086) closed for direct bookings inserts). This
-- migration closes the database-level exposure per the mission's standing
-- rule to server-enforce ownership relationships rather than trust a
-- client-submitted value, regardless of whether today's UI happens to use
-- the path.
--
-- Fix: require, in both the INSERT WITH CHECK and the UPDATE WITH CHECK,
-- that a listing exists whose supplier_id matches the row's supplier_id
-- AND whose id matches the row's listing_id, and that a booking exists
-- whose id matches the row's booking_id AND whose listing_id matches the
-- row's own listing_id (so booking and listing must agree with each
-- other, not just each independently belong to *some* listing of the
-- caller's). The UPDATE USING clause (which rows an owner may act on at
-- all) is left as supplier_id = auth.uid() -- unchanged -- only the WITH
-- CHECK (what the row may become) is tightened, so a supplier can still
-- update status/notes/discount fields on their own existing vouchers
-- without needing to re-supply a passing booking/listing pair.

drop policy if exists "Suppliers can write own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can write own vouchers"
  on public.supplier_booking_vouchers
  for insert
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1
      from public.listings l
      where l.id = supplier_booking_vouchers.listing_id
        and l.supplier_id = supplier_booking_vouchers.supplier_id
    )
    and exists (
      select 1
      from public.bookings b
      where b.id = supplier_booking_vouchers.booking_id
        and b.listing_id = supplier_booking_vouchers.listing_id
    )
  );

drop policy if exists "Suppliers can update own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can update own vouchers"
  on public.supplier_booking_vouchers
  for update
  using (supplier_id = auth.uid())
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1
      from public.listings l
      where l.id = supplier_booking_vouchers.listing_id
        and l.supplier_id = supplier_booking_vouchers.supplier_id
    )
    and exists (
      select 1
      from public.bookings b
      where b.id = supplier_booking_vouchers.booking_id
        and b.listing_id = supplier_booking_vouchers.listing_id
    )
  );
