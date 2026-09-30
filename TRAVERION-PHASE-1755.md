# TRAVERION PHASE 1755 — Create listing gated to editors

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Listings write RLS (1744) and Listings page CTAs were editor-only, but Create remained fully interactive for finance/viewer (sidebar + mobile + family cards). Deep-link `?create=` also opened the editor before the close-form effect ran — a silent RLS dead-end.

## Fix

Gate Create page cards, Layout/sidebar Create CTAs, and Listings URL `create=` deep-links with `canManageBookings`.

## Verification

- Vitest wiring cert.
