# TRAVERION PHASE 1784 — Pickup CSV audit records filter snapshot

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Pickup Export audited `{ surface: 'pickup' }` only — day/listing/needsPickup/query omitted.

## Fix

Record dayPreset, listing, needsPickupOnly, query, and date_from/to on the export run.

## Verification

- Vitest wiring cert.
