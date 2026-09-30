# TRAVERION PHASE 1741 — Reminder emails honor host pickup note overrides

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1716 made Trips show Pickup planner `meeting_point` / `pickup_instructions` overrides, but `resolveBookingTiedContent` (experience reminders / paid confirm logistics) only read `purchase_snapshot`. Day-before mail could still say thin snapshot copy while Trips was correct.

## Fix

Load `special_requests` in notify-customer-booking; prefer note overrides over snapshot when building tour `meetingPoint`.

## Verification

- Vitest content cert.
- Deploy `notify-customer-booking`.
