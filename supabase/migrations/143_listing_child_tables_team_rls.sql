-- Phase 1145: listing_availability, listing_stay_private, listing_discounts
-- team RLS via is_supplier_account_side (parity with listings 141).

-- Availability SELECT (draft calendars for team)
drop policy if exists "Listing availability is viewable by everyone" on public.listing_availability;
create policy "Listing availability is viewable by everyone"
  on public.listing_availability for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_availability.listing_id
        and (
          l.status = 'published'
          or public.is_supplier_account_side(l.supplier_id)
        )
    )
  );

drop policy if exists "Suppliers can manage availability for own listings" on public.listing_availability;
create policy "Suppliers can manage availability for own listings"
  on public.listing_availability for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can update availability for own listings" on public.listing_availability;
create policy "Suppliers can update availability for own listings"
  on public.listing_availability for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can delete availability for own listings" on public.listing_availability;
create policy "Suppliers can delete availability for own listings"
  on public.listing_availability for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_availability.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

-- Stay private address
drop policy if exists "listing_stay_private_select_owner" on public.listing_stay_private;
create policy "listing_stay_private_select_owner"
  on public.listing_stay_private for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_side(l.supplier_id)
    )
  );

drop policy if exists "listing_stay_private_insert_owner" on public.listing_stay_private;
create policy "listing_stay_private_insert_owner"
  on public.listing_stay_private for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_side(l.supplier_id)
    )
  );

drop policy if exists "listing_stay_private_update_owner" on public.listing_stay_private;
create policy "listing_stay_private_update_owner"
  on public.listing_stay_private for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_side(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_side(l.supplier_id)
    )
  );

drop policy if exists "listing_stay_private_delete_owner" on public.listing_stay_private;
create policy "listing_stay_private_delete_owner"
  on public.listing_stay_private for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_side(l.supplier_id)
    )
  );

-- Discounts
drop policy if exists "Listings discounts: public read" on public.listing_discounts;
create policy "Listings discounts: public read"
  on public.listing_discounts for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_discounts.listing_id
        and (
          l.status = 'published'
          or public.is_supplier_account_side(l.supplier_id)
        )
    )
  );

drop policy if exists "Suppliers can insert discounts for own listings" on public.listing_discounts;
create policy "Suppliers can insert discounts for own listings"
  on public.listing_discounts for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

drop policy if exists "Suppliers can update/delete own listing discounts" on public.listing_discounts;
create policy "Suppliers can update/delete own listing discounts"
  on public.listing_discounts for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );

-- Delete policy name from 002 if present
drop policy if exists "Suppliers can delete own listing discounts" on public.listing_discounts;
create policy "Suppliers can delete own listing discounts"
  on public.listing_discounts for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_discounts.listing_id
        and public.is_supplier_account_side(l.supplier_id)
    )
  );
