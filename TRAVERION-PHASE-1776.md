# TRAVERION PHASE 1776 — Team roster errors do not use localStorage roles

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`fetchSupplierTeamMembers` fell back to `loadSupplierTeam()` localStorage on SELECT error — forgeable `owner` roles bypassed UI gates alongside 1775.

## Fix

Throw on Supabase error so `useSupplierRole` fail-closes to viewer.

## Verification

- Vitest wiring cert.
