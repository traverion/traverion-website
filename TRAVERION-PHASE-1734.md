# TRAVERION PHASE 1734 — Listing delete must not wipe bookings / Money

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partner **Remove listing** hard-deleted via `bookings.listing_id ON DELETE CASCADE`, wiping paid trips and Money history while the UI claimed bookings stay. Past-only paid listings got no upcoming-paid warning.

## Fix

- Migration `213`: `ON DELETE RESTRICT` on `bookings.listing_id`.
- UI: count any bookings; block Remove and tell partners to take offline; honest copy.
- `deleteListing` returns structured error on FK 23503.

## Verification

- Vitest wiring + impact helpers.
- Apply migration 213.
