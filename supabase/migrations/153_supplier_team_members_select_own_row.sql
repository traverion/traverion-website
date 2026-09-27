-- Phase 1201: supplier_team_members SELECT without recursive EXISTS.
-- Migration 014 required EXISTS on the same table, so invited teammates could not
-- read their own membership row under RLS. That broke resolveSupplierId (client)
-- and partner portal gates that look up supplier_team_members by user_id.
-- Owners still read the full team via supplier_id = auth.uid().

drop policy if exists "Team members can read own supplier team" on public.supplier_team_members;
create policy "Team members can read own supplier team"
  on public.supplier_team_members
  for select
  using (
    user_id = auth.uid()::text
    or supplier_id = auth.uid()::text
  );
