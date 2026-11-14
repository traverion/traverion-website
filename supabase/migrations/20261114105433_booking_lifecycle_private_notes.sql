-- Customer-facing cancellation reads must not include the supplier's written
-- explanation or evidence notes. Panel admins read those through a definer
-- function. Service role keeps full table access for notification jobs.

revoke select on table public.cancellation_requests from anon, authenticated;

grant select (
  id,
  booking_id,
  requested_by,
  requester_user_id,
  reason_code,
  status,
  policy_snapshot,
  applied_fee,
  fee_currency,
  traveler_refund_expectation,
  created_at,
  expires_at,
  responded_at,
  responded_by
) on table public.cancellation_requests to authenticated;

create or replace function public.read_cancellation_private_note(p_request_id uuid)
returns table (reason_text text, evidence_note text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_request_id is null or not public.is_traverion_panel_admin() then
    return;
  end if;
  return query
    select r.reason_text, r.evidence_note
    from public.cancellation_requests r
    where r.id = p_request_id;
end;
$$;

revoke all on function public.read_cancellation_private_note(uuid) from public, anon;
grant execute on function public.read_cancellation_private_note(uuid) to authenticated, service_role;

alter table public.supplier_activity_notifications
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create unique index if not exists supplier_activity_notifications_booking_cancelled_uidx
  on public.supplier_activity_notifications (supplier_id, booking_id)
  where event_type = 'booking_cancelled' and booking_id is not null;
