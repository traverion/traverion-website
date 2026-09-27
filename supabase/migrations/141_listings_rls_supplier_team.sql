-- Phase 1143: listings SELECT/UPDATE/INSERT/DELETE for supplier team
-- (parity with bookings 138). insertListing resolves owner supplier_id client-side.

create or replace function public.is_supplier_account_side(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_supplier_id is not null
    and (
      p_supplier_id = auth.uid()
      or exists (
        select 1
        from public.supplier_team_members stm
        where stm.supplier_id = p_supplier_id::text
          and stm.user_id = auth.uid()::text
      )
    );
$$;

comment on function public.is_supplier_account_side(uuid) is
  'True when auth.uid() is this supplier account or a supplier_team_members row for it.';

drop policy if exists "Listings readable when published or owner" on public.listings;
create policy "Listings readable when published or owner"
  on public.listings for select
  using (
    status = 'published'
    or public.is_supplier_account_side(supplier_id)
  );

drop policy if exists "Suppliers can update own listings" on public.listings;
create policy "Suppliers can update own listings"
  on public.listings for update
  using (public.is_supplier_account_side(supplier_id))
  with check (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can insert own listings" on public.listings;
create policy "Suppliers can insert own listings"
  on public.listings for insert
  with check (public.is_supplier_account_side(supplier_id));

drop policy if exists "Suppliers can delete own listings" on public.listings;
create policy "Suppliers can delete own listings"
  on public.listings for delete
  using (public.is_supplier_account_side(supplier_id));
