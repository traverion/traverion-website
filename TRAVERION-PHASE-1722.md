# TRAVERION PHASE 1722 — Second review / schedule edit supplier emails

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

1. After the first review for a supplier, later reviews saved but `new_review` partner email stayed `already_sent` under permanent `supplier:new_review:{supplierId}`.
2. Second host schedule edit emailed the traveler but skipped supplier `host_schedule_updated` under booking-scoped default.

## Fix

- `submitReview`: `idempotencyKey: supplier:new_review:{reviewId}` (+ bookingId when present).
- `updateBookingSchedule`: suffix supplier key with fieldDiff after values.

## Verification

- Vitest wiring certs.
