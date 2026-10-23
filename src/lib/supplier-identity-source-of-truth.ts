/**
 * Source-of-truth map — Traverion-native Custom Connect API onboarding (TEST).
 *
 * Traverion owns ordinary supplier profile + commercial terms + Traverion-designed
 * onboarding forms that submit permitted fields via backend Accounts/Persons APIs.
 * Stripe owns verification outcomes, identity document storage, bank credentials,
 * and capability state. Never treat Traverion IBAN verification as payout readiness.
 */

export const SUPPLIER_IDENTITY_SOURCE_OF_TRUTH = {
  traverion_owned: [
    'supplier_profiles.display_name',
    'supplier_profiles.company_legal_name',
    'supplier_profiles.business_type',
    'supplier_profiles.address_*',
    'supplier_profiles.company_registration_number',
    'supplier_profiles.tax_id',
    'supplier_profiles.vat_id',
    'supplier_profiles.managing_directors',
    'supplier_profiles.contact_phone',
    'supplier_profiles.verification_status (Traverion ops)',
    'supplier_profiles.payout_iban / payout_bic (legacy rail only)',
    'supplier_commercial_terms.payout_cadence',
    'supplier_profiles.payment_cycle (preference only)',
  ],
  stripe_owned: [
    'Connected Account KYC verification outcomes',
    'Identity document binaries (Files / Identity — not Traverion tables)',
    'Beneficial owners / representatives (stored on connected account)',
    'External bank accounts (tokenized; never raw numbers in Traverion)',
    'connect_* capability mirrors (synced from Stripe Account)',
    'stripe_connected_account_id (reference only)',
    'connect_account_type (express legacy vs custom native)',
  ],
  routes: {
    business_identity: '/partner/business-profile',
    payments_payouts: '/partner/money?tab=settings',
    income_overview: '/partner/money?tab=overview',
  },
  onboarding: {
    new_accounts: 'custom_api_native',
    legacy_express: 'embedded_remediation_only',
  },
} as const;
