-- Phase 1777: listing_stay_private SELECT requires editor roles.
-- Writes already editor (218); check-in addresses must not be readable by finance/viewer.

drop policy if exists "listing_stay_private_select_owner" on public.listing_stay_private;
create policy "listing_stay_private_select_owner"
  on public.listing_stay_private for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_supplier_account_editor(l.supplier_id)
    )
  );
