/**
 * Traverion native verification architecture (TEST).
 *
 * Selected model: Custom connected accounts + API-based requirement collection
 * so suppliers complete Traverion-designed forms without Express login popups
 * or Stripe-hosted Account Link redirects for ordinary onboarding.
 *
 * Why not Express + embedded alone:
 * - Express accounts authenticate the connected user with Stripe (popup / hosted).
 * - After first Account Link, Express KYC is not fully API-writable.
 * - That forces supplier-facing Stripe UI, which breaks Traverion ownership of UX.
 *
 * Compliance implications of Custom / application-collected requirements:
 * - Traverion is responsible for collecting accurate KYC data and presenting
 *   required disclosures / Connected Account Agreement acceptance.
 * - Traverion must keep forms updated as Stripe requirements change.
 * - Stripe risk reviews may still require a provider-controlled remediation step.
 * - Identity document / liveness capture must use Stripe Files / Identity or a
 *   narrowly scoped embedded component — never store raw ID images in Traverion tables.
 *
 * Existing Express accounts:
 * - Never silently recreate or change controller responsibilities.
 * - Continue on embedded Account Session path until a deliberate TEST re-onboard.
 *
 * Banking:
 * - Tokenize via Stripe.js → attach as external_account through backend.
 * - Never persist raw bank credentials in Traverion application tables.
 */

export const CONNECT_NATIVE_ONBOARDING = {
  accountTypeForNewAccounts: 'custom' as const,
  onboardingMode: 'api_native' as const,
  providerControlledExceptions: [
    'stripe_risk_verification_remediation',
    'complex_identity_document_capture_when_file_api_insufficient',
  ],
  englishLocale: 'en-GB',
  environments: {
    testOnly: true,
    liveTransfersEnabled: false,
  },
} as const;
