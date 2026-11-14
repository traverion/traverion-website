-- Independent delivery schedule. The worker secret stays in Vault.
-- This job does not include the secret, and it does not mark mail sent.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;
grant usage on schema internal to postgres;

create or replace function internal.invoke_deliver_transactional_email()
returns bigint
language plpgsql
security definer
set search_path = internal, vault, net, extensions
as $$
declare
  request_id bigint;
  worker_secret text;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'email_delivery_cron_secret'
  limit 1;
  if worker_secret is null or length(worker_secret) < 32 then
    raise exception 'email delivery worker secret is not configured';
  end if;
  select net.http_post(
    url := 'https://xcopqllkulxfkpunetbc.supabase.co/functions/v1/deliver-transactional-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := '{"limit":20}'::jsonb,
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function internal.invoke_deliver_transactional_email() from public, anon, authenticated;
grant execute on function internal.invoke_deliver_transactional_email() to postgres;

select cron.schedule(
  'deliver-transactional-email',
  '* * * * *',
  $$select internal.invoke_deliver_transactional_email();$$
);
