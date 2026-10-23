/**
 * Phase 1 audit — Native verification UX (2026-10-23).
 *
 * Root causes of Express vs Traverion choice:
 * - Royal Nordic / early TEST suppliers created Express accounts
 *   (requirement_collection=stripe) which force provider login UI.
 * - UI exposed start_native_custom as a supplier-facing choice.
 *
 * Fix direction:
 * - Default path is always Traverion-native Custom API forms.
 * - On ensure_account: if linked Express + TEST + no money movement,
 *   auto-archive to connect_legacy_account_id and create Custom (server-side).
 * - If Express has transfer/payout history or LIVE: show support message only
 *   (no architectural choice buttons).
 *
 * Loading waterfalls identified:
 * - Journey mounts → ensure_account (create/sync) → fetchSupplierProfile again
 * - Income settings also refresh on return
 * - Embedded Account Session created even when Custom path is intended
 *
 * Optimizations:
 * - Dedicated /partner/verification route (no Income tabs chrome)
 * - Single ensure/bootstrap on entry; reuse result across steps
 * - Prefill from profile props; no re-fetch per step
 * - No Account Session until identity exception
 */
export const CONNECT_VERIFICATION_AUDIT = {
  date: '2026-10-23',
  eliminateSupplierChoice: true,
  autoArchiveExpressWhenSafe: true,
  dedicatedRoute: '/partner/verification',
  preserveLiveAndFundedAccounts: true,
} as const;
