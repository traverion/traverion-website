# TRAVERION PHASE 1753 — Availability day Clear/Save gated for finance

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1747 gated bulk edit and `saveCap`, but finance/viewer could still open a day sheet and hit Clear (and Save UI) — `clearCap` had no role check and relied on opaque RLS.

## Fix

Gate `clearCap` like `saveCap`; disable day-sheet Save/Clear when `!canEditCalendar`. Day cells stay tappable so finance can still view occupancy.

## Verification

- Vitest wiring cert.
