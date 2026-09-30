# TRAVERION PHASE 1767 — Finance Inbox must not clear Unread locally

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After 1762, `mark_booking_messages_read` no-ops for finance/viewer but returns ok. The thread UI still stamped messages read and fired `onMarkedRead`, clearing Unread until refresh.

## Fix

When `composeBlock === 'role'`, skip mark-read RPC and local Unread clear.

## Verification

- Vitest wiring cert.
