# TRAVERION PHASE 1808 — Supplier review hierarchy polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Supplier review rows buried the product title in a muted meta line and did not
clearly separate guest copy from the supplier response.

## Fix

- Shared `.tv-review-card` / `__reply` surfaces.
- Product title as display headline; guest + status chips below.
- Explicit “Guest review” vs “Your response” blocks with rating `/5`.

## Verification

- Vitest wiring cert.
- No review write/reply policy changes.
