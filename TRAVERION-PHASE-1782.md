# TRAVERION PHASE 1782 — Await Stripe Checkout expire after unpaid cancel

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Unpaid cancel fire-and-forget invoked `expire-booking-checkout`. Network/403 failures left Checkout open → late pay → orphan refund path.

## Fix

Await the edge invoke (still best-effort: cancel already succeeded if expire fails).

## Verification

- Vitest wiring cert.
