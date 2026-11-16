/**
 * P9.1 — Fully native supplier payout onboarding (decision record).
 *
 * Overall: GO on Custom / platform-collected native wizard for new suppliers (TEST first);
 * GO on dual-path Express retention; NO-GO on RN/LIVE Express migration, payout enablement,
 * Accounts v2 rewrite-first, or claiming zero Stripe UI in every case.
 *
 * ## Architecture (new suppliers)
 * - Near-term: Custom (Accounts v1) + API requirement collection (`api_native`).
 * - Strategic later: Accounts v2 `dashboard: "none"` + `losses_collector: application`
 *   + recipient/`stripe_transfers` — separate Phase D; does not block native UX.
 * - Charge pattern unchanged: platform MoR + separate charges and transfers (SCAT).
 * - Requirements collector = platform — required for Traverion forms and
 *   `disable_stripe_user_authentication` on Account Sessions.
 *
 * ## Native collectors (Custom)
 * - Business, representative, TOS/disclosures, bank (Stripe.js token → external_account),
 *   payout preferences, Traverion status copy.
 * - Never persist raw bank credentials or ID images in Traverion tables.
 *
 * ## Stripe-controlled exceptions (do not claim zero provider UI)
 * - Proof-of-liveness / electronic ID credential → hosted or embedded.
 * - Risk intervention / remediation.
 * - Requirement schema drift (platform owns form updates).
 * - Async verification timing (capabilities pending until Stripe clears).
 * - Express legacy: Stripe user auth popup mandatory for sensitive embeds.
 *
 * ## Existing accounts
 * - LIVE Express (incl. Royal Nordic `acct_1UcAxbCOlSVGqrHJ`): remain on embedded path
 *   inside the same wizard shell. Never replace/disconnect/migrate without approval.
 * - `connect_legacy_account_id` parking unchanged; no in-place Express→Custom on LIVE.
 * - TEST Express may use gated `start_native_custom` only.
 *
 * ## Safety
 * - Payout kill switches remain OFF.
 * - No READY periods, LIVE transfers, or new LIVE accounts without approval.
 * - P9.3: LIVE Custom creation requires `live_custom_onboarding_enabled=1` and a row in
 *   `live_custom_onboarding_allowlist`. Both default empty/off. Existing Express accounts are reused.
 */

export const CONNECT_NATIVE_ONBOARDING = {
  decisionId: 'P9.1' as const,
  accountTypeForNewAccounts: 'custom' as const,
  onboardingMode: 'api_native' as const,
  wizardStepCount: 6 as const,
  dualPath: {
    custom: 'api_native' as const,
    expressLegacy: 'embedded' as const,
  },
  providerControlledExceptions: [
    'stripe_risk_verification_remediation',
    'proof_of_liveness_or_electronic_id_credential',
    'complex_identity_document_capture_when_file_api_insufficient',
    'express_stripe_user_authentication_popup',
  ],
  goNoGo: {
    nativeWizardForNewCustom: 'GO',
    retainLiveExpressDualPath: 'GO',
    claimZeroStripeUiAlways: 'NO_GO',
    migrateRoyalNordicOrLiveExpress: 'NO_GO',
    enablePayoutExecutionOrTransfers: 'NO_GO',
    accountsV2BeforeNativeUx: 'NO_GO',
    createLiveConnectAccountsInDesignPhase: 'NO_GO',
  },
  frozenLiveExpressAccountId: 'acct_1UcAxbCOlSVGqrHJ' as const,
  englishLocale: 'en-GB',
  environments: {
    testOnly: true,
    liveTransfersEnabled: false,
  },
  copy: {
    setupPayouts: 'Set up payouts',
    verifyIdentity: 'Verify your identity',
    addBank: 'Add your bank account',
    underReview: 'Your information is being reviewed',
    readyForPayouts: "You're ready to receive payouts",
  },
} as const;

export type ConnectNativeGoNoGoKey = keyof typeof CONNECT_NATIVE_ONBOARDING.goNoGo;
