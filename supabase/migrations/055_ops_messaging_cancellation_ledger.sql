-- Additive: post-booking messaging, supplier cancellation requests, supplier fee ledger.
-- Does not alter existing booking/payment/inventory columns. Does not reset data.

-- =============================================================================
-- Helpers
-- =============================================================================

create or replace function public.is_booking_party(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where b.id = p_booking_id
      and auth.uid() is not null
      and (
        l.supplier_id = auth.uid()
        or b.guest_user_id = auth.uid()
        or (
          length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
          and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
  );
$$;

create or replace function public.booking_is_paid_for_ops(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
  );
$$;

revoke all on function public.is_booking_party(uuid) from public;
revoke all on function public.booking_is_paid_for_ops(uuid) from public;
grant execute on function public.is_booking_party(uuid) to authenticated;
grant execute on function public.booking_is_paid_for_ops(uuid) to authenticated;

-- =============================================================================
-- booking_messages (post-booking only; insert via RPC)
-- =============================================================================

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_role text not null check (sender_role in ('traveler', 'supplier', 'system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_by_traveler_at timestamptz,
  read_by_supplier_at timestamptz
);

create index if not exists booking_messages_booking_created_idx
  on public.booking_messages(booking_id, created_at asc);

alter table public.booking_messages enable row level security;

drop policy if exists "Booking parties can read messages" on public.booking_messages;
create policy "Booking parties can read messages"
  on public.booking_messages for select
  using (public.is_booking_party(booking_id));

drop policy if exists "No direct message inserts" on public.booking_messages;
create policy "No direct message inserts"
  on public.booking_messages for insert
  with check (false);

drop policy if exists "No direct message updates" on public.booking_messages;
create policy "No direct message updates"
  on public.booking_messages for update
  using (false);

comment on table public.booking_messages is
  'In-app thread for a paid booking relationship. Pre-booking chat is not supported (commission avoidance).';

-- =============================================================================
-- cancellation_requests
-- =============================================================================

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by text not null check (requested_by in ('traveler', 'supplier')),
  requester_user_id uuid references auth.users(id) on delete set null,
  reason_code text not null,
  reason_text text not null default '',
  evidence_note text,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'declined', 'expired', 'resolved')),
  policy_snapshot jsonb not null default '{}'::jsonb,
  applied_fee numeric not null default 0,
  fee_currency text not null default 'EUR',
  traveler_refund_expectation text not null default 'full_refund',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null
);

create unique index if not exists cancellation_requests_one_open_per_booking
  on public.cancellation_requests(booking_id)
  where status = 'requested';

create index if not exists cancellation_requests_booking_idx
  on public.cancellation_requests(booking_id, created_at desc);

alter table public.cancellation_requests enable row level security;

drop policy if exists "Booking parties can read cancellation requests" on public.cancellation_requests;
create policy "Booking parties can read cancellation requests"
  on public.cancellation_requests for select
  using (public.is_booking_party(booking_id));

drop policy if exists "No direct cancellation request writes" on public.cancellation_requests;
create policy "No direct cancellation request writes"
  on public.cancellation_requests for insert
  with check (false);

drop policy if exists "No direct cancellation request updates" on public.cancellation_requests;
create policy "No direct cancellation request updates"
  on public.cancellation_requests for update
  using (false);

comment on table public.cancellation_requests is
  'Supplier (or traveler) cancellation workflow. expires_at is informational; Traverion does not auto-accept. Founder must set auto-accept policy before enabling a job.';

-- =============================================================================
-- supplier_ledger_entries (server-only writes)
-- =============================================================================

create table if not exists public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in (
    'booking_earnings',
    'refund',
    'platform_commission',
    'cancellation_penalty',
    'adjustment',
    'payout'
  )),
  amount numeric not null,
  currency text not null default 'EUR',
  reason text not null,
  source_id text not null,
  policy_id text,
  created_at timestamptz not null default now(),
  unique (kind, source_id)
);

create index if not exists supplier_ledger_supplier_created_idx
  on public.supplier_ledger_entries(supplier_id, created_at desc);

alter table public.supplier_ledger_entries enable row level security;

drop policy if exists "Suppliers can view own ledger" on public.supplier_ledger_entries;
create policy "Suppliers can view own ledger"
  on public.supplier_ledger_entries for select
  using (auth.uid() = supplier_id);

drop policy if exists "No client ledger inserts" on public.supplier_ledger_entries;
create policy "No client ledger inserts"
  on public.supplier_ledger_entries for insert
  with check (false);

drop policy if exists "No client ledger updates" on public.supplier_ledger_entries;
create policy "No client ledger updates"
  on public.supplier_ledger_entries for update
  using (false);

comment on table public.supplier_ledger_entries is
  'Signed financial adjustments. cancellation_penalty is inserted only by accept_cancellation_request. Unique (kind, source_id) makes retries idempotent.';

-- =============================================================================
-- RPCs
-- =============================================================================

create or replace function public.post_booking_message(p_booking_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := left(trim(coalesce(p_body, '')), 4000);
  v_supplier uuid;
  v_status text;
  v_pay text;
  v_role text;
  v_id uuid;
  v_open_cancel boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to send a message.');
  end if;
  if char_length(v_body) < 1 then
    return jsonb_build_object('ok', false, 'error', 'Write a message before sending.');
  end if;

  select l.supplier_id, b.status, lower(trim(coalesce(b.payment_status, '')))
    into v_supplier, v_status, v_pay
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;

  if not public.is_booking_party(p_booking_id) then
    return jsonb_build_object('ok', false, 'error', 'You can only message about a booking you are part of.');
  end if;

  select exists (
    select 1 from public.cancellation_requests cr
    where cr.booking_id = p_booking_id and cr.status = 'requested'
  ) into v_open_cancel;

  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Messaging opens after this booking is paid.');
  end if;

  if lower(trim(coalesce(v_status, ''))) = 'cancelled' and not v_open_cancel then
    return jsonb_build_object('ok', false, 'error', 'This booking is closed. You can still read earlier messages.');
  end if;

  if v_supplier = v_uid then
    v_role := 'supplier';
  else
    v_role := 'traveler';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (p_booking_id, v_role, v_uid, v_body)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.mark_booking_messages_read(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if not public.is_booking_party(p_booking_id) then
    return jsonb_build_object('ok', false, 'error', 'You cannot open this conversation.');
  end if;
  select l.supplier_id into v_supplier
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;
  if v_supplier = v_uid then
    update public.booking_messages
      set read_by_supplier_at = coalesce(read_by_supplier_at, now())
    where booking_id = p_booking_id and sender_role = 'traveler' and read_by_supplier_at is null;
  else
    update public.booking_messages
      set read_by_traveler_at = coalesce(read_by_traveler_at, now())
    where booking_id = p_booking_id and sender_role in ('supplier', 'system') and read_by_traveler_at is null;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.request_supplier_cancellation(
  p_booking_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_evidence_note text default null,
  p_policy_snapshot jsonb default '{}'::jsonb,
  p_applied_fee numeric default 0,
  p_fee_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_status text;
  v_pay text;
  v_code text := upper(trim(coalesce(p_reason_code, '')));
  v_text text := left(trim(coalesce(p_reason_text, '')), 2000);
  v_evidence text := left(trim(coalesce(p_evidence_note, '')), 2000);
  v_id uuid;
  v_allowed text[] := array[
    'FORCE_MAJEURE',
    'UNSAFE_WEATHER',
    'GOVERNMENT_RESTRICTION',
    'SUPPLIER_STAFF_UNAVAILABLE',
    'VEHICLE_OR_EQUIPMENT_FAILURE',
    'OVERBOOKING',
    'MINIMUM_PARTICIPATION_NOT_MET',
    'OPERATIONAL_ERROR',
    'TRAVELER_REQUESTED_DIRECTLY',
    'OTHER'
  ];
  v_fm boolean;
  v_fee numeric := coalesce(p_applied_fee, 0);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_code <> all (v_allowed) then
    return jsonb_build_object('ok', false, 'error', 'Choose a cancellation reason.');
  end if;
  if char_length(v_text) < 12 then
    return jsonb_build_object('ok', false, 'error', 'Explain what happened (at least a short sentence).');
  end if;

  v_fm := v_code in ('FORCE_MAJEURE', 'UNSAFE_WEATHER', 'GOVERNMENT_RESTRICTION');
  if v_fm and char_length(v_text) < 24 then
    return jsonb_build_object('ok', false, 'error', 'Force majeure needs a clear explanation of why the trip cannot run.');
  end if;

  -- Server classifies fee. Client snapshot is stored for audit but fee is not client-authoritative.
  if v_fm then
    v_fee := 0;
  else
    v_fee := 20;
  end if;

  select l.supplier_id, b.status, lower(trim(coalesce(b.payment_status, '')))
    into v_supplier, v_status, v_pay
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null or v_supplier <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'You can only cancel bookings for your own listings.');
  end if;
  if lower(trim(coalesce(v_status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already cancelled.');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Only paid bookings can go through this cancellation request.');
  end if;

  if exists (
    select 1 from public.cancellation_requests cr
    where cr.booking_id = p_booking_id and cr.status = 'requested'
  ) then
    return jsonb_build_object('ok', false, 'error', 'A cancellation request is already waiting for the traveler.');
  end if;

  insert into public.cancellation_requests (
    booking_id,
    requested_by,
    requester_user_id,
    reason_code,
    reason_text,
    evidence_note,
    status,
    policy_snapshot,
    applied_fee,
    fee_currency,
    traveler_refund_expectation,
    expires_at
  ) values (
    p_booking_id,
    'supplier',
    v_uid,
    v_code,
    v_text,
    nullif(v_evidence, ''),
    'requested',
    coalesce(p_policy_snapshot, '{}'::jsonb) || jsonb_build_object(
      'server_applied_fee', v_fee,
      'server_force_majeure', v_fm,
      'auto_accept_hours', null
    ),
    v_fee,
    upper(trim(coalesce(p_fee_currency, 'EUR'))),
    'full_refund',
    now() + interval '72 hours'
  )
  returning id into v_id;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    p_booking_id,
    'system',
    v_uid,
    'Supplier requested cancellation. Open this booking to review the reason and respond.'
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'applied_fee', v_fee);
end;
$$;

create or replace function public.respond_cancellation_request(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.cancellation_requests%rowtype;
  v_supplier uuid;
  v_guest_user uuid;
  v_guest_email text;
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_ledger_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;

  select l.supplier_id, b.guest_user_id, b.guest_email
    into v_supplier, v_guest_user, v_guest_email
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = v_req.booking_id;

  if not (
    v_guest_user = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;

  if v_req.status = 'accepted' then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;

  if not p_accept then
    update public.cancellation_requests
      set status = 'declined', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
    insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
    values (v_req.booking_id, 'system', v_uid, 'Traveler declined the cancellation request. The booking stays active.');
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'declined');
  end if;

  update public.cancellation_requests
    set status = 'accepted', responded_at = now(), responded_by = v_uid
  where id = v_req.id and status = 'requested';
  if not found then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_req.reason_code,
      refund_choice = 'full_refund'
    where id = v_req.booking_id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if v_req.applied_fee > 0 and v_supplier is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier,
      v_req.booking_id,
      'cancellation_penalty',
      - abs(v_req.applied_fee),
      v_req.fee_currency,
      'Supplier cancellation fee',
      v_req.id::text,
      coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_cancel_v1')
    )
    on conflict (kind, source_id) do nothing
    returning id into v_ledger_id;
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_req.booking_id, 'system', v_uid, 'Traveler accepted the cancellation. This booking is cancelled.');

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id
  );
end;
$$;

revoke all on function public.post_booking_message(uuid, text) from public;
revoke all on function public.mark_booking_messages_read(uuid) from public;
revoke all on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) from public;
revoke all on function public.respond_cancellation_request(uuid, boolean) from public;

grant execute on function public.post_booking_message(uuid, text) to authenticated;
grant execute on function public.mark_booking_messages_read(uuid) to authenticated;
grant execute on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) to authenticated;
grant execute on function public.respond_cancellation_request(uuid, boolean) to authenticated;
