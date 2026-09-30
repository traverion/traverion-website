-- Phase 1746: listing child-table writes require editor roles
-- (availability, stay private address, discounts), matching listings 1744.

-- Availability writes
drop policy if exists "Suppliers can manage availability for own listings" on public.listing_availability;
create policy "Suppliers can manage availability for own listings"
  on public.listing_availability for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can update availability for own listings" on public.listing_availability;
create policy "Suppliers can update availability for own listings"
  on public.listing_availability for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can delete availability for own listings" on public.listing_availability;
create policy "Suppliers can delete availability for own listings"
  on public.listing_availability for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  );

-- Stay private address writes (SELECT stays account-side)
drop policy if exists "listing_stay_private_insert_owner" on public.listing_stay_private;
create policy "listing_stay_private_insert_owner"
  on public.listing_stay_private for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "listing_stay_private_update_owner" on public.listing_stay_private;
create policy "listing_stay_private_update_owner"
  on public.listing_stay_private for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "listing_stay_private_delete_owner" on public.listing_stay_private;
create policy "listing_stay_private_delete_owner"
  on public.listing_stay_private for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );

-- Discounts writes
drop policy if exists "Suppliers can insert discounts for own listings" on public.listing_discounts;
create policy "Suppliers can insert discounts for own listings"
  on public.listing_discounts for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can update/delete own listing discounts" on public.listing_discounts;
create policy "Suppliers can update/delete own listing discounts"
  on public.listing_discounts for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can delete own listing discounts" on public.listing_discounts;
create policy "Suppliers can delete own listing discounts"
  on public.listing_discounts for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_editor(l.supplier_id)
    )
  );
