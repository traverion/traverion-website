-- Track one-time welcome email for new supplier accounts (dedupe in Edge Function).
alter table public.supplier_profiles
  add column if not exists welcome_email_sent_at timestamptz;

comment on column public.supplier_profiles.welcome_email_sent_at is
  'Set when supplier_welcome notification email was sent via notify-supplier-event.';
