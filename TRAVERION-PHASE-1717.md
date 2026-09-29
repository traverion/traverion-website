# TRAVERION PHASE 1717 — Partner password reset on www must not hop after establish

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Supplier/dual-role recovery landing on www `/set-password` established the session (consuming the one-time code), then redirected to `partner…/reset-password` with empty credentials → **invalid link**. Password never changed.

## Root cause

Cross-origin hop after `exchangeCodeForSession`. Session + recovery flag are origin-scoped; partner host saw a bare reset URL.

## Fix

On marketing host, when portal resolves to partner, render `PartnerResetPasswordPage` in place (success already goes to partner login). Do not `location.replace` after establish.

## Verification

- Vitest: no post-establish partner hop.
