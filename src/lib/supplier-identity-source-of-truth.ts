/**
 * Phase 1 — Source-of-truth map (Mission: Supplier Identity & Embedded Connect).
 *
 * Traverion owns ordinary supplier profile + commercial terms.
 * Stripe owns KYC, identity documents, bank credentials, and capability state.
 * Never treat Traverion IBAN verification as Stripe payout readiness.
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
    'Connected Account KYC / identity documents',
    'Beneficial owners / representatives (where required)',
    'External bank accounts (never store raw numbers in Traverion)',
    'connect_* capability mirrors (synced from Stripe Account)',
    'stripe_connected_account_id (reference only)',
  ],
  routes: {
    business_identity: '/partner/business-profile',
    payments_payouts: '/partner/money?tab=settings',
    income_overview: '/partner/money?tab=overview',
  },
} as const;
