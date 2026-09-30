# TRAVERION PHASE 1813 — Supplier bookings row scanability

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Bookings console rows packed guest, product, date, party, and money into dense
muted lines with cramped padding — hard to operate like a live OTA console.

## Fix

- Shared `.tv-ops-booking-row` chrome.
- Display guest name; payment chip; amount as its own display line.
- Larger thumb + tap padding.

## Verification

- Vitest wiring cert.
- No booking filter/action/money logic changes.
