-- Phase 1198: supplier_booking_ops_notes for supplier team.
-- Keep 108 booking→listing ownership EXISTS on writes; swap auth.uid() for is_supplier_account_side.

drop policy if exists "Suppliers can read own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can read own booking notes"
  on public.supplier_booking_ops_notes
  for select
  using (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can upsert own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes
  for insert
  with check (
    public.is_supplier_account_side(supplier_id)
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
  using (public.is_supplier_account_side(supplier_id))
  with check (
    public.is_supplier_account_side(supplier_id)
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
  using (public.is_supplier_account_side(supplier_id));
