-- Service-role-only payment audit tables.
-- Staging cert DBs may have been created without RLS; production already
-- enables RLS with no anon/authenticated policies (fail closed).

alter table if exists public.stripe_webhook_events enable row level security;
alter table if exists public.booking_payment_events enable row level security;

revoke all on table public.stripe_webhook_events from public, anon, authenticated;
revoke all on table public.booking_payment_events from public, anon, authenticated;

grant select, insert, update, delete on table public.stripe_webhook_events to service_role;
grant select, insert, update, delete on table public.booking_payment_events to service_role;
