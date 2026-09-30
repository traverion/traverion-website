# TRAVERION PHASE 1739 — Shrink booking_earnings ledger on partial refund

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1735 shrunk `amount_paid` (Collected) on partial Stripe refunds but left `supplier_ledger_entries.booking_earnings` at the original gross. Partner Money Ledger disagreed with Collected; full-refund reverse later used the stale gross until amount was restored elsewhere.

## Fix

Migration `214_shrink_paid_booking_earnings_partial.sql` — service-role `shrink_paid_booking_earnings` updates the earnings row down to remaining (never increases). `stripe-webhook` calls it after shrinking `amount_paid`.

## Verification

- Vitest wiring cert.
- `supabase db push` + deploy `stripe-webhook`.
