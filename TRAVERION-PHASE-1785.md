# TRAVERION PHASE 1785 — Campaigns / notes / vouchers SELECT editors

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Writes for campaigns, ops notes, and vouchers were editor-locked, but SELECT still used
`is_supplier_account_side` — viewers could read guest-facing campaign recipients, internal
ops notes, and voucher codes.

## Fix

Migration 231: SELECT policies on `supplier_message_campaigns`, `supplier_booking_ops_notes`,
and `supplier_booking_vouchers` require `is_supplier_account_editor`.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 231.
