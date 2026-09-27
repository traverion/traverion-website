-- Phase 1198: supplier_booking_vouchers SELECT/INSERT/UPDATE for supplier team.
-- Keep 099 ownership EXISTS (listing + booking agree with supplier_id);
-- swap auth.uid() ownership checks for is_supplier_account_side.

drop policy if exists "Suppliers can read own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can read own vouchers"
  on public.supplier_booking_vouchers
  for select
  using (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can write own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can write own vouchers"
  on public.supplier_booking_vouchers
  for insert
  with check (
    public.is_supplier_account_side(supplier_id)
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
  using (public.is_supplier_account_side(supplier_id))
  with check (
    public.is_supplier_account_side(supplier_id)
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
