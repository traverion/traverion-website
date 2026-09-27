-- Phase 1209: supplier_team_members roster SELECT for all account-side JWTs.
-- Migration 153 let teammates read their own row (resolveSupplierId) and owners
-- read by supplier_id = auth.uid(). Non-owner teammates still could not list
-- peer rows for the owner account. Allow any member of a supplier to SELECT
-- that supplier's full roster (still not other suppliers).

drop policy if exists "Team members can read own supplier team" on public.supplier_team_members;
create policy "Team members can read own supplier team"
  on public.supplier_team_members
  for select
  using (
    user_id = auth.uid()::text
    or supplier_id = auth.uid()::text
    or exists (
      select 1
      from public.supplier_team_members me
      where me.supplier_id = supplier_team_members.supplier_id
        and me.user_id = auth.uid()::text
    )
  );
