# TRAVERION PHASE 1728 — Admin Finance Collected matches late no_refund cancels

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1725 fixed partner Money so cancelled + paid + `no_refund` stays in Collected. Admin Finance `isCollected` still dropped every cancelled row, so platform Collected/Available undercounted vs partner Money while claiming the same formula.

## Fix

Align `admin-supplier-verification` finance_summary `isCollected` with `isCollectedBooking` (keep cancelled+paid+no_refund).

## Verification

- Vitest wiring cert.
- Deploy `admin-supplier-verification`.
