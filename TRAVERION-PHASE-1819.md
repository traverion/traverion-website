# TRAVERION PHASE 1819 — Booking message thread polish

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Problem

Inbox threads used flat bubble colors and a secondary “Post message” control —
not messaging-product clarity.

## Fix

- Shared `.tv-msg-bubble*` + `.tv-msg-composer`.
- Primary “Send message” CTA; clearer mine/theirs/system surfaces.

## Verification

- Vitest wiring cert.
- No mark-read / post auth changes.
