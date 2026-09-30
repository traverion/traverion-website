# TRAVERION PHASE 1815 — Money transaction presentation

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Money ledger / collected / payout rows used dense muted meta and small
tabular amounts that did not match the display money hierarchy on the hero.

## Fix

- Shared `.tv-money-row` / `__amount` (display numerals).
- Clearer meta uppercase rhythm; Stripe TEST labels preserved.

## Verification

- Vitest wiring cert.
- Presentation only — no balance/export math changes.
