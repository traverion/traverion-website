# TRAVERION PHASE 1705 — Cancel Accept/Decline host/traveler emails

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Host requests cancellation → traveler Accept/Decline in Trips succeeds in UI → **host never gets** `cancellation_accepted` / `cancellation_declined` email (traveler self-receipt also 401s).

## Root cause

`notifyCancellationResolved` runs under the **guest JWT**. Auth allowlists only permitted `guest_message`, `booking_detail_changed`, `booking_cancelled` (supplier) and `your_details_updated` / `booking_cancelled` (customer). Accept/Decline kinds were treated as host/ops and returned **401**.

## Fix

Phase 1705: allow `cancellation_accepted` and `cancellation_declined` for guest JWTs on both `guestMayInvokeSupplierEvent` and `guestMayInvokeCustomerEmailKind` (src + Deno `_shared` mirrors). Host-initiated `cancellation_requested*` stays forbidden for guests.

## Verification

- Vitest: auth allowlist + MyBookings wiring + Deno mirror certs.
- **Deploy** updated `notify-supplier-event` and `notify-customer-booking` edge functions (shared auth modules) before production mail works.
