# TRAVERION PHASE 1810 — Partner Inbox thread list polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Inbox rows packed date, party, departure, and last-message time into one
faint line; unread/open states were weak; tap padding felt cramped.

## Fix

- Shared `.tv-inbox-list` / `.tv-inbox-thread` surfaces.
- Unread/open via data attributes.
- Preview + timestamp split; clearer listing/meta hierarchy.

## Verification

- Vitest wiring cert.
- No messaging auth or mark-read logic changes.
