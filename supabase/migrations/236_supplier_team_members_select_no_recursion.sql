-- Phase 1851: fix infinite recursion on supplier_team_members SELECT.
-- Migration 156 added an EXISTS subquery on the same table so teammates could
-- read peer roster rows. That EXISTS re-enters the SELECT policy and raises
-- 42P17 ("infinite recursion detected in policy"), which fail-closes traveler
-- checkout (viewerIsListingSupplierSide) and any client team lookup.
--
-- Use SECURITY DEFINER helpers so membership checks do not re-apply RLS.

create or replace function public.auth_is_supplier_team_member(p_supplier_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_supplier_id is not null
    and exists (
      select 1
      from public.supplier_team_members stm
      where stm.supplier_id = p_supplier_id
        and stm.user_id = auth.uid()::text
    );
$$;

comment on function public.auth_is_supplier_team_member(text) is
  'True when auth.uid() has a supplier_team_members row for this supplier (bypasses RLS).';

create or replace function public.auth_is_supplier_team_owner(p_supplier_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_supplier_id is not null
    and (
      p_supplier_id = auth.uid()::text
      or exists (
        select 1
        from public.supplier_team_members stm
        where stm.supplier_id = p_supplier_id
          and stm.user_id = auth.uid()::text
          and stm.role = 'owner'
      )
    );
$$;

comment on function public.auth_is_supplier_team_owner(text) is
  'True when auth.uid() is the supplier account or an owner team row (bypasses RLS).';

revoke all on function public.auth_is_supplier_team_member(text) from public;
revoke all on function public.auth_is_supplier_team_owner(text) from public;
grant execute on function public.auth_is_supplier_team_member(text) to authenticated;
grant execute on function public.auth_is_supplier_team_owner(text) to authenticated;

drop policy if exists "Team members can read own supplier team" on public.supplier_team_members;
create policy "Team members can read own supplier team"
  on public.supplier_team_members
  for select
  using (
    user_id = auth.uid()::text
    or supplier_id = auth.uid()::text
    or public.auth_is_supplier_team_member(supplier_id)
  );

drop policy if exists "Owners can add team members" on public.supplier_team_members;
create policy "Owners can add team members"
  on public.supplier_team_members
  for insert
  with check (public.auth_is_supplier_team_owner(supplier_id));

drop policy if exists "Owners can update team members" on public.supplier_team_members;
create policy "Owners can update team members"
  on public.supplier_team_members
  for update
  using (public.auth_is_supplier_team_owner(supplier_id))
  with check (public.auth_is_supplier_team_owner(supplier_id));

drop policy if exists "Owners can delete team members" on public.supplier_team_members;
create policy "Owners can delete team members"
  on public.supplier_team_members
  for delete
  using (public.auth_is_supplier_team_owner(supplier_id));
