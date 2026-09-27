# Traverion — Phase 1060

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Day-before reminder emails loaded live `listings.meeting_point` / `pickup_instructions` / `title` and passed them into `notify-customer-booking`. Phase 1052 usually overwrote title/meeting from `purchase_snapshot`, but:

1. Caller-supplied meeting stuck when the snapshot lacked meeting fields (post-purchase listing edits could still appear).
2. Snapshot `meetingPoint || pickupInstructions` dropped traveler start instructions whenever place was set (Phase 1059 split).

## Fix

1. `resolveBookingTiedContent` joins snap `meetingPoint` + `pickupInstructions` with ` — `.
2. `notify-customer-booking` always replaces body `meetingPoint` after re-derivation (never keeps caller logistics).
3. `send-booking-reminders` passes only booking identity + optional time diffs; start time prefers `purchase_snapshot.startTimeHm`.

## Certification

- AUTOMATED-TESTED: `notify-customer-content.test.ts`, `edge-function-deno-mirror-sync.test.ts`
- Deployed: `notify-customer-booking`, `send-booking-reminders`
