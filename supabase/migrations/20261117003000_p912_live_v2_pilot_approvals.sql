-- P9.12: Admin pilot approval is separate from LIVE creation allowlisting.
-- Approving a supplier here does not set live_custom_onboarding_enabled and does not insert allowlist rows.

create table if not exists public.live_accounts_v2_pilot_approvals (
  supplier_id uuid primary key references public.supplier_profiles (id) on delete cascade,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  owner_confirmed boolean not null default false,
  stripe_verification_acknowledged boolean not null default false,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  note text
);

comment on table public.live_accounts_v2_pilot_approvals is
  'Admin approval that a named supplier may later be considered for LIVE Accounts v2 allowlisting. Does not enable the creation gate or insert allowlist rows.';

alter table public.live_accounts_v2_pilot_approvals enable row level security;

revoke all on table public.live_accounts_v2_pilot_approvals from public;
revoke all on table public.live_accounts_v2_pilot_approvals from anon;
revoke all on table public.live_accounts_v2_pilot_approvals from authenticated;
grant select, insert, update, delete on table public.live_accounts_v2_pilot_approvals to service_role;
