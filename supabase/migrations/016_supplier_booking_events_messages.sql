-- Supplier shared booking timeline + communication records.

create table if not exists public.supplier_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in ('booking_created', 'acknowledged', 'status_confirmed', 'status_cancelled', 'note')
  ),
  details text,
  created_at timestamptz not null default now()
);

create index if not exists supplier_booking_events_supplier_idx
  on public.supplier_booking_events(supplier_id, created_at desc);
create index if not exists supplier_booking_events_booking_idx
  on public.supplier_booking_events(booking_id, created_at asc);

create table if not exists public.supplier_booking_messages (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  subject text not null,
  recipients text[] not null default '{}',
  booking_ids uuid[] not null default '{}',
  channel text not null default 'email' check (channel in ('email', 'sms', 'other')),
  body_preview text,
  created_at timestamptz not null default now()
);

create index if not exists supplier_booking_messages_supplier_idx
  on public.supplier_booking_messages(supplier_id, created_at desc);

alter table public.supplier_booking_events enable row level security;
alter table public.supplier_booking_messages enable row level security;

create policy "Suppliers can read own booking events"
  on public.supplier_booking_events
  for select using (supplier_id = auth.uid());

create policy "Suppliers can write own booking events"
  on public.supplier_booking_events
  for insert with check (supplier_id = auth.uid());

create policy "Suppliers can read own booking messages"
  on public.supplier_booking_messages
  for select using (supplier_id = auth.uid());

create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages
  for insert with check (supplier_id = auth.uid());

