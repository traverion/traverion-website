-- P9.16: durable audit trail for business verification admin decisions.
-- Does not alter existing verification statuses or Stripe mappings.

create table if not exists public.supplier_verification_review_events (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_profiles (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  decision text not null
    check (decision in ('submitted', 'approve', 'request_changes', 'reject')),
  feedback text,
  before_status text,
  after_status text,
  created_at timestamptz not null default now()
);

comment on table public.supplier_verification_review_events is
  'P9.16 audit log for Traverion business verification submissions and admin decisions.';

create index if not exists supplier_verification_review_events_supplier_created_idx
  on public.supplier_verification_review_events (supplier_id, created_at desc);

alter table public.supplier_verification_review_events enable row level security;

-- Staff read via service role in admin-supplier-verification. Suppliers may read own history.
drop policy if exists supplier_verification_review_events_select_own
  on public.supplier_verification_review_events;
create policy supplier_verification_review_events_select_own
  on public.supplier_verification_review_events
  for select
  to authenticated
  using (
    supplier_id = auth.uid()
    or public.auth_is_supplier_team_member(supplier_id::text)
  );

revoke insert, update, delete on public.supplier_verification_review_events from authenticated;
grant select on public.supplier_verification_review_events to authenticated;
