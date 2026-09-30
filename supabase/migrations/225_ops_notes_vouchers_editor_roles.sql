-- Phase 1761: ops notes + vouchers writes require editor roles.
-- SELECT stays account-side so finance/viewer can still read.

drop policy if exists "Suppliers can upsert own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes
  for insert
  with check (
    public.is_supplier_account_editor(supplier_id)
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
  using (public.is_supplier_account_editor(supplier_id))
  with check (
    public.is_supplier_account_editor(supplier_id)
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_ops_notes.booking_id
        and l.supplier_id = supplier_booking_ops_notes.supplier_id
    )
  );

drop policy if exists "Suppliers can delete own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can delete own booking notes"
  on public.supplier_booking_ops_notes
  for delete
  using (public.is_supplier_account_editor(supplier_id));

drop policy if exists "Suppliers can write own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can write own vouchers"
  on public.supplier_booking_vouchers
  for insert
  with check (
    public.is_supplier_account_editor(supplier_id)
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
  using (public.is_supplier_account_editor(supplier_id))
  with check (
    public.is_supplier_account_editor(supplier_id)
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
