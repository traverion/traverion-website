-- Phase 1001: staff force-unpublish for marketplace moderation.
--
-- Partner suppliers can already deactivate (status → draft). Staff had no
-- audited path to remove an unsafe/spam listing from traveler discovery when
-- the supplier will not (or cannot) act. Existing bookings must keep working;
-- force-unpublish only removes public sellability (same as supplier Deactivate).
--
-- Trust model matches admin_record_supplier_payout (094): SECURITY DEFINER RPC
-- granted ONLY to service_role, reachable via admin-supplier-verification's
-- assertAdmin() gate — never directly by authenticated/anon clients.

create table if not exists public.admin_listing_moderation_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  supplier_id uuid,
  action text not null check (action in ('force_unpublish')),
  previous_status text,
  new_status text not null,
  reason text not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  upcoming_paid_bookings integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists admin_listing_moderation_events_listing_idx
  on public.admin_listing_moderation_events (listing_id, created_at desc);

create index if not exists admin_listing_moderation_events_created_idx
  on public.admin_listing_moderation_events (created_at desc);

comment on table public.admin_listing_moderation_events is
  'Audit log for staff listing moderation (e.g. force-unpublish). Written only by admin_force_unpublish_listing.';

alter table public.admin_listing_moderation_events enable row level security;

revoke all on table public.admin_listing_moderation_events from anon, authenticated;

create or replace function public.admin_force_unpublish_listing(
  p_listing_id uuid,
  p_reason text,
  p_actor_id uuid default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_prev text;
  v_upcoming integer := 0;
  v_event_id uuid;
  v_email text := nullif(trim(coalesce(p_actor_email, '')), '');
begin
  if p_listing_id is null then
    return jsonb_build_object('ok', false, 'error', 'listing_id is required');
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'error', 'reason must be at least 3 characters');
  end if;
  if char_length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'reason is too long');
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'listing not found');
  end if;

  v_prev := v_listing.status;

  select count(*)::integer into v_upcoming
  from public.bookings b
  where b.listing_id = p_listing_id
    and lower(trim(coalesce(b.status, ''))) is distinct from 'cancelled'
    and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
    and coalesce(b.check_out, b.booking_date) >= (timezone('utc', now()))::date;

  if lower(trim(coalesce(v_prev, ''))) is distinct from 'published' then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'listing_id', p_listing_id,
      'supplier_id', v_listing.supplier_id,
      'previous_status', v_prev,
      'new_status', v_prev,
      'upcoming_paid_bookings', v_upcoming,
      'error', null
    );
  end if;

  update public.listings
  set status = 'draft'
  where id = p_listing_id;

  insert into public.admin_listing_moderation_events (
    listing_id,
    supplier_id,
    action,
    previous_status,
    new_status,
    reason,
    actor_id,
    actor_email,
    upcoming_paid_bookings
  ) values (
    p_listing_id,
    v_listing.supplier_id,
    'force_unpublish',
    v_prev,
    'draft',
    v_reason,
    p_actor_id,
    v_email,
    v_upcoming
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'event_id', v_event_id,
    'listing_id', p_listing_id,
    'supplier_id', v_listing.supplier_id,
    'title', v_listing.title,
    'previous_status', v_prev,
    'new_status', 'draft',
    'upcoming_paid_bookings', v_upcoming
  );
end;
$$;

comment on function public.admin_force_unpublish_listing(uuid, text, uuid, text) is
  'Admin-only (service_role via assertAdmin): sets a published listing to draft for moderation. Does not cancel bookings. Audits to admin_listing_moderation_events.';

revoke all on function public.admin_force_unpublish_listing(uuid, text, uuid, text) from public;
revoke all on function public.admin_force_unpublish_listing(uuid, text, uuid, text) from anon;
revoke all on function public.admin_force_unpublish_listing(uuid, text, uuid, text) from authenticated;
grant execute on function public.admin_force_unpublish_listing(uuid, text, uuid, text) to service_role;
