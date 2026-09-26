-- Phase 808: close a NULL-status bypass on public.bookings.status -- the
-- same bug class migration 092 already closed on public.listings.status.
--
-- migration 001 (and every migration since) defined the column without
-- NOT NULL:
--   status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled'))
-- A CHECK constraint does not restrict NULL, so status could always be
-- explicitly set to NULL via a direct client UPDATE (e.g.
-- supabase.from('bookings').update({status: null})) even though the
-- app's own UI never does this.
--
-- Traced every ownership-only UPDATE policy currently governing
-- public.bookings ("Suppliers can update booking status for their
-- listings", migration 003; "Consumers can cancel own bookings[ by user
-- id]", migrations 037/098): every one of them re-checks row ownership
-- only in its WITH CHECK clause and never constrains what value `status`
-- may be set to. bookings_protect_payment_fields() (051 -> 078 -> 085 ->
-- 087), the trigger that otherwise locks down this table's commercial
-- and identity fields against direct client writes, only freezes
-- status/cancelled_at/cancellation_reason/refund_choice once
-- payment_status = 'paid' (085's own header: "Unpaid bookings are
-- unaffected -- the legitimate 'release an unpaid hold' path") -- by
-- design, since updateBookingStatus()/batchCancelBookings() legitimately
-- need to set status = 'cancelled' on an unpaid booking with no service-
-- role round trip. That same unguarded path lets any authenticated
-- supplier (on their own listing's booking) or traveler (on their own
-- booking) set status = null instead, on any UNPAID booking they own,
-- bypassing the CHECK(status in (...)) constraint entirely -- proved
-- against today's committed baseline (003+037+078+085+087) in
-- supabase/tests/bookings_status_not_null_guard.test.sql Case 1/1b,
-- including via a raw service-role write (Case 1b) -- confirming RLS
-- alone was never the right layer to close this at.
--
-- Impact assessment (this phase's own honest read, not inherited from
-- 092): unlike the equivalent listings.status gap, no live consumer of
-- bookings.status was found to mis-handle NULL destructively --
-- booking_occupies_inventory() (054/059/076) already guards with
-- `coalesce(p_status, '') IS DISTINCT FROM 'cancelled'`, and both
-- src/lib/status-language.ts's bookingLifecycleLabel() and the
-- cancel_booking_as_traveler/respond_cancellation_request RPCs (098)
-- already coalesce status defensively before comparing it. So this is
-- NOT a proven live exploit with a demonstrated customer/revenue-facing
-- bad outcome today -- it is a structural schema gap: any future code
-- (a new admin tool, a new report, a new RPC) that assumes
-- bookings.status is always one of the three documented enum values
-- would silently mishandle a NULL row, and the column's own CHECK
-- constraint gives no actual guarantee of that today. Closing it now, at
-- the schema layer, makes the whole bug class structurally impossible
-- going forward rather than relying on every future call site
-- remembering to coalesce -- the same reasoning 092 already applied to
-- listings.status.
--
-- Fix: backfill any existing NULL rows (none expected in today's data --
-- the app has never written NULL here -- but handled defensively and
-- fail-safe): a NULL row whose payment_status already indicates payment
-- succeeded backfills to 'confirmed' (matching booking_occupies_inventory's
-- and the UI's existing "paid implies occupies/confirmed" treatment);
-- every other NULL row backfills to 'pending' (the fail-safe default this
-- column already uses for every legitimately-created row). Then status
-- becomes NOT NULL, matching the column's default and its CHECK
-- constraint's actual intent.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- bookings_status_not_null_guard.test.sql): the exploit (a supplier or
-- traveler PATCHing status = NULL on their own unpaid booking, and a raw
-- service-role write doing the same) succeeds against today's committed
-- baseline and is rejected (NOT NULL violation) after this migration; the
-- legitimate unpaid-hold-release status update, migration 085's paid-
-- booking cancellation-truth guard, and a legitimate service-role status
-- write are all unaffected.

update public.bookings
set status = case
  when lower(trim(coalesce(payment_status, ''))) in ('paid', 'complete', 'succeeded') then 'confirmed'
  else 'pending'
end
where status is null;

alter table public.bookings
  alter column status set not null;
