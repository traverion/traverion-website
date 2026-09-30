-- Phase 1744: listings INSERT/UPDATE/DELETE require editor team roles
-- (owner / manager / ops), matching canManageBookings used for canEditListings.
-- SELECT stays on is_supplier_account_side so finance/viewer can still read drafts.

create or replace function public.is_supplier_account_editor(p_supplier_id uuid)
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
          and lower(trim(coalesce(stm.role, ''))) in ('owner', 'manager', 'ops')
      )
    );
$$;

comment on function public.is_supplier_account_editor(uuid) is
  'Phase 1744: true when auth.uid() is this supplier account or a team member with owner/manager/ops (not finance/viewer).';

revoke all on function public.is_supplier_account_editor(uuid) from public;
grant execute on function public.is_supplier_account_editor(uuid) to authenticated;
grant execute on function public.is_supplier_account_editor(uuid) to service_role;

drop policy if exists "Suppliers can update own listings" on public.listings;
create policy "Suppliers can update own listings"
  on public.listings for update
  using (public.is_supplier_account_editor(supplier_id))
  with check (public.is_supplier_account_editor(supplier_id));

drop policy if exists "Suppliers can insert own listings" on public.listings;
create policy "Suppliers can insert own listings"
  on public.listings for insert
  with check (public.is_supplier_account_editor(supplier_id));

drop policy if exists "Suppliers can delete own listings" on public.listings;
create policy "Suppliers can delete own listings"
  on public.listings for delete
  using (public.is_supplier_account_editor(supplier_id));
