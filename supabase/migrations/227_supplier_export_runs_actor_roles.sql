-- Phase 1765: supplier_export_runs INSERT requires owner/manager/ops/finance (not viewer).
-- Money (finance) and Bookings/Pickup (editors) both audit CSVs; viewers must not forge runs.

create or replace function public.is_supplier_account_export_actor(p_supplier_id uuid)
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
          and lower(trim(coalesce(stm.role, ''))) in ('owner', 'manager', 'ops', 'finance')
      )
    );
$$;

comment on function public.is_supplier_account_export_actor(uuid) is
  'Phase 1765: true when auth.uid() may insert supplier_export_runs (owner or team owner/manager/ops/finance; not viewer).';

revoke all on function public.is_supplier_account_export_actor(uuid) from public;
grant execute on function public.is_supplier_account_export_actor(uuid) to authenticated;
grant execute on function public.is_supplier_account_export_actor(uuid) to service_role;

drop policy if exists "Suppliers can write own export runs" on public.supplier_export_runs;
create policy "Suppliers can write own export runs"
  on public.supplier_export_runs
  for insert
  with check (
    public.is_supplier_account_export_actor(supplier_id)
    and (actor_id is null or actor_id = auth.uid())
  );
