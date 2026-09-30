# TRAVERION PHASE 1795 — Surface verification email failures to admin

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Admin approve/reject returned `ok: true` with `email.sent: false`, but the UI
ignored the email payload — founders thought suppliers were notified.

## Fix

Surface a soft error when `email.sent === false` and not skipped. Verification
status still commits.

## Verification

- Vitest wiring cert.
