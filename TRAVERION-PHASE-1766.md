# TRAVERION PHASE 1766 — Guest note updates light Inbox Unread

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Guest place-of-stay / notes updates emailed hosts (`booking_detail_changed`) but never created a `booking_messages` row. Partners living in Inbox never saw Unread for note changes.

## Fix

After a successful note change with field diffs, also `postBookingMessage` a traveler thread summary so Inbox lists the thread and Unread lights up (email path unchanged).

## Verification

- Vitest wiring cert.
