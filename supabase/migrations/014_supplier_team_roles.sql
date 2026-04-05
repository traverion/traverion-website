-- Supplier team roles for role-based permissions in supplier portal.
-- Phase 2: server-backed team memberships.

create table if not exists public.supplier_team_members (
  supplier_id text not null,
  user_id text not null,
  label text,
  role text not null check (role in ('owner', 'manager', 'ops', 'finance', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (supplier_id, user_id)
);

create index if not exists supplier_team_members_user_id_idx
  on public.supplier_team_members(user_id);

alter table public.supplier_team_members enable row level security;

-- Read team rows if you are a member of that supplier.
drop policy if exists "Team members can read own supplier team" on public.supplier_team_members;
create policy "Team members can read own supplier team"
  on public.supplier_team_members
  for select
  using (
    exists (
      select 1
      from public.supplier_team_members stm
      where stm.supplier_id = supplier_team_members.supplier_id
        and stm.user_id = auth.uid()::text
    )
  );

-- Any authenticated user can create their own owner row for first-time bootstrap.
drop policy if exists "Users can bootstrap own owner membership" on public.supplier_team_members;
create policy "Users can bootstrap own owner membership"
  on public.supplier_team_members
  for insert
  with check (
    user_id = auth.uid()::text
    and supplier_id = auth.uid()::text
    and role = 'owner'
  );

-- Owners can manage team for their supplier.
drop policy if exists "Owners can add team members" on public.supplier_team_members;
create policy "Owners can add team members"
  on public.supplier_team_members
  for insert
  with check (
    exists (
      select 1
      from public.supplier_team_members owner_row
      where owner_row.supplier_id = supplier_team_members.supplier_id
        and owner_row.user_id = auth.uid()::text
        and owner_row.role = 'owner'
    )
  );

drop policy if exists "Owners can update team members" on public.supplier_team_members;
create policy "Owners can update team members"
  on public.supplier_team_members
  for update
  using (
    exists (
      select 1
      from public.supplier_team_members owner_row
      where owner_row.supplier_id = supplier_team_members.supplier_id
        and owner_row.user_id = auth.uid()::text
        and owner_row.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.supplier_team_members owner_row
      where owner_row.supplier_id = supplier_team_members.supplier_id
        and owner_row.user_id = auth.uid()::text
        and owner_row.role = 'owner'
    )
  );

drop policy if exists "Owners can delete team members" on public.supplier_team_members;
create policy "Owners can delete team members"
  on public.supplier_team_members
  for delete
  using (
    exists (
      select 1
      from public.supplier_team_members owner_row
      where owner_row.supplier_id = supplier_team_members.supplier_id
        and owner_row.user_id = auth.uid()::text
        and owner_row.role = 'owner'
    )
  );

