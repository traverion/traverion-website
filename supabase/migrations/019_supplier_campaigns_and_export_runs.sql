-- Campaign metadata + export run tracking for supplier operations.

create table if not exists public.supplier_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  subject text not null,
  scope text not null check (scope in ('selected', 'filtered')),
  filters_snapshot jsonb,
  booking_ids uuid[] not null default '{}',
  recipients text[] not null default '{}',
  recipients_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'partial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_message_campaigns_supplier_idx
  on public.supplier_message_campaigns(supplier_id, created_at desc);

create table if not exists public.supplier_export_runs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('bookings', 'ops_summary')),
  format text not null check (format in ('csv', 'json')),
  scope text not null check (scope in ('filtered', 'selected')),
  date_from date,
  date_to date,
  row_count int not null default 0,
  filters_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists supplier_export_runs_supplier_idx
  on public.supplier_export_runs(supplier_id, created_at desc);

alter table public.supplier_booking_messages
  add column if not exists campaign_id uuid references public.supplier_message_campaigns(id) on delete set null;

create index if not exists supplier_booking_messages_campaign_idx
  on public.supplier_booking_messages(campaign_id);

alter table public.supplier_message_campaigns enable row level security;
alter table public.supplier_export_runs enable row level security;

create policy "Suppliers can read own message campaigns"
  on public.supplier_message_campaigns
  for select using (supplier_id = auth.uid());

create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns
  for insert with check (supplier_id = auth.uid());

create policy "Suppliers can update own message campaigns"
  on public.supplier_message_campaigns
  for update using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

create policy "Suppliers can read own export runs"
  on public.supplier_export_runs
  for select using (supplier_id = auth.uid());

create policy "Suppliers can write own export runs"
  on public.supplier_export_runs
  for insert with check (supplier_id = auth.uid());

