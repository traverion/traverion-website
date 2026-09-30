# TRAVERION PHASE 1750 — Guest-facing ops writes require editor roles

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`supplier_booking_events`, `supplier_booking_messages`, and `supplier_message_campaigns` writes still used `is_supplier_account_side`. Finance/viewer could insert guest-facing campaign/message rows while the product treats those as editor ops.

## Fix

Migration `222_supplier_ops_writes_editor_roles.sql` — those writes use `is_supplier_account_editor`. Export runs stay account-side so finance can still log Money CSV exports.

## Verification

- Vitest wiring cert.
- `supabase db push`.
