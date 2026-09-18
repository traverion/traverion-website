-- Durable idempotency for transactional emails (booking / verification / welcome / reminders).
-- Edge Functions write with service role. Clients never insert directly.

create table if not exists public.transactional_email_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  channel text not null check (channel in ('customer', 'supplier', 'staff')),
  template_key text not null,
  recipient_email text,
  entity_type text,
  entity_id text,
  provider_message_id text,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  constraint transactional_email_log_idempotency_key_unique unique (idempotency_key)
);

create index if not exists transactional_email_log_entity_idx
  on public.transactional_email_log (entity_type, entity_id, template_key, created_at desc);

create index if not exists transactional_email_log_created_idx
  on public.transactional_email_log (created_at desc);

alter table public.transactional_email_log enable row level security;

-- No client policies: only service_role / postgres may read/write.
drop policy if exists "No client access to transactional email log" on public.transactional_email_log;
create policy "No client access to transactional email log"
  on public.transactional_email_log
  for all
  to authenticated, anon
  using (false)
  with check (false);

comment on table public.transactional_email_log is
  'Idempotency + delivery audit for Resend transactional emails. Unique idempotency_key prevents duplicate sends on retries.';

alter table public.consumer_profiles
  add column if not exists welcome_email_sent_at timestamptz;

comment on column public.consumer_profiles.welcome_email_sent_at is
  'When Traverion traveler welcome email was sent (dedupe).';

alter table public.supplier_profiles
  add column if not exists verification_submitted_email_sent_at timestamptz;

comment on column public.supplier_profiles.verification_submitted_email_sent_at is
  'When supplier received “verification submitted” confirmation email.';

alter table public.bookings
  add column if not exists reminder_email_sent_at timestamptz,
  add column if not exists review_request_email_sent_at timestamptz;

comment on column public.bookings.reminder_email_sent_at is
  'When ~24h-before experience reminder email was sent.';
comment on column public.bookings.review_request_email_sent_at is
  'When post-trip review request email was sent.';
