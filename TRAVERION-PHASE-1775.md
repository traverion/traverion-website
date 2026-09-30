# TRAVERION PHASE 1775 — Partner role hook fails closed as viewer

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`useSupplierRole` initialized as `owner` and kept prior role on fetch throw. Before roster load (or on error), finance/viewer briefly had Export and editor UI; Bookings CSV is client-side so RLS cannot stop guest PII.

## Fix

Default and error path → `viewer`. Unsigned / no-user → `viewer`.

## Verification

- Vitest wiring cert.
