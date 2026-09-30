# TRAVERION PHASE 1799 — Booking events/messages SELECT require editors

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Outbound `supplier_booking_messages.recipients` (guest emails) stayed readable
by viewers after writes were editor-locked.

## Fix

Migration 235: SELECT on events/messages requires `is_supplier_account_editor`.

## Verification

- Vitest + `supabase db push`.
