# TRAVERION PHASE 1706 — Guest Trips note update email keeps change table

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler Trips → edit special requests / notes → save succeeds → traveler `your_details_updated` email says “Here is what changed” but the before→after table is empty. Same hole emptied refund diffs on guest `booking_cancelled` self-receipts.

## Root cause

Guest JWT is allowed to invoke `your_details_updated` / `booking_cancelled`, but `notify-customer-booking` set `allowCallerFieldDiffs = callerIsSupplierSide` only — guest payloads had `fieldDiffs` stripped to `[]`.

## Fix

Phase 1706: `allowCallerFieldDiffs` when supplier-side **or** guest invoking a `guestMayInvokeCustomerEmailKind` kind. Host/ops kinds still cannot smuggle diffs via guest JWT (those kinds 401 first).

## Verification

- Vitest: allowlist helper + edge wiring + Trips client cert.
- Redeployed `notify-customer-booking`.
