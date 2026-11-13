-- PREPARED — NOT APPLIED. Awaits owner approval.
-- Mig recreate drift left anon EXECUTE on Edge-only commercial/claim helpers.
-- Intended: claim + freeze = service_role only; supplier_active_commercial_terms = auth + service_role.

revoke all on function public.claim_stay_booking_request_accept(uuid, uuid) from public;
revoke all on function public.claim_stay_booking_request_accept(uuid, uuid) from anon, authenticated;
grant execute on function public.claim_stay_booking_request_accept(uuid, uuid) to service_role;

revoke all on function public.freeze_booking_commercial_terms(uuid) from public;
revoke all on function public.freeze_booking_commercial_terms(uuid) from anon, authenticated;
grant execute on function public.freeze_booking_commercial_terms(uuid) to service_role;

revoke all on function public.supplier_active_commercial_terms(uuid, timestamptz) from public;
revoke all on function public.supplier_active_commercial_terms(uuid, timestamptz) from anon;
grant execute on function public.supplier_active_commercial_terms(uuid, timestamptz) to authenticated, service_role;
