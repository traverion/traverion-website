-- Cancellation notices are committed to the existing outbox before the
-- supplier is told they are queued. A worker delivers them later.
-- "sent" is still only written after the provider accepts the message.

alter table public.transactional_email_log
  add column if not exists payload jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
declare
  c name;
begin
  select con.conname into c
  from pg_constraint con
  where con.conrelid = 'public.transactional_email_log'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if c is not null then
    execute format('alter table public.transactional_email_log drop constraint %I', c);
  end if;
end $$;

alter table public.transactional_email_log
  add constraint transactional_email_log_status_check
  check (status in ('queued', 'sending', 'sent', 'skipped', 'failed'));

create index if not exists transactional_email_log_delivery_idx
  on public.transactional_email_log (status, next_attempt_at, created_at)
  where status in ('queued', 'sending', 'failed');

comment on column public.transactional_email_log.payload is
  'Rendered message for the delivery worker. Null on historical sent/failed rows. Never includes provider credentials.';

-- Claim is the only path that moves a row to sending. Stale sending locks
-- are reclaimed so a crashed worker cannot leave a notice unsent.
create or replace function public.claim_transactional_email_deliveries(p_limit integer)
returns setof public.transactional_email_log
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select l.id
    from public.transactional_email_log l
    where l.payload is not null
      and (
        (l.status = 'queued' and (l.next_attempt_at is null or l.next_attempt_at <= now()))
        or (
          l.status = 'sending'
          and l.locked_at is not null
          and l.locked_at <= now() - interval '2 minutes'
        )
        or (
          l.status = 'failed'
          and l.attempt_count < 5
          and l.next_attempt_at is not null
          and l.next_attempt_at <= now()
        )
      )
    order by l.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  update public.transactional_email_log l
  set status = 'sending',
      locked_at = now(),
      attempt_count = l.attempt_count + 1,
      updated_at = now()
  from picked
  where l.id = picked.id
  returning l.*;
end;
$$;

revoke all on function public.claim_transactional_email_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_transactional_email_deliveries(integer) to service_role;

comment on function public.claim_transactional_email_deliveries(integer) is
  'Worker claim for queued cancellation mail. Service role only. Does not mark a message sent.';
