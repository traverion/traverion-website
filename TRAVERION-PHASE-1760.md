# TRAVERION PHASE 1760 — Money CSV export role gate + audit log

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1750 left `supplier_export_runs` writable for finance so Money CSV could be audited, but Export never called `insertSupplierExportRun`. Any team role (including viewer) could download Collected/Refund-due/ledger CSV. `canManageFinance` was unused.

## Fix

Gate Export with `canManageFinance`; after download insert an `ops_summary` export run with `filters_snapshot.surface = money`.

## Verification

- Vitest wiring cert.
