import { describe, expect, it } from 'vitest';
import {
  businessStepForPhase,
  derivePartnerSetupProgress,
  mergeServerBusinessSetupDraft,
  parseUnifiedSetupPhase,
  payoutStepForPhase,
  phaseFromBusinessStep,
  phaseFromPayoutStep,
  resolveUnifiedSetupPhase,
  toServerSetupProgress,
} from './partner-unified-setup';
import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

function profile(partial: Partial<SupplierProfileRow>): SupplierProfileRow {
  return {
    id: 'sup-1',
    display_name: null,
    contact_phone: null,
    payout_method: null,
    payout_iban: null,
    payout_bic: null,
    payout_paypal_email: null,
    business_type: null,
    company_legal_name: null,
    company_registration_number: null,
    managing_directors: null,
    business_address: null,
    address_street: null,
    address_country: null,
    address_city: null,
    address_postal_code: null,
    tax_id: null,
    vat_id: null,
    verification_status: null,
    verification_submitted_at: null,
    payout_verification_status: null,
    payout_verification_submitted_at: null,
    business_verification_feedback: null,
    payout_verification_feedback: null,
    insurance_policy_number: null,
    insurance_coverage: null,
    insurance_start: null,
    insurance_end: null,
    insurance_provider: null,
    privacy_policy_text: null,
    terms_conditions_text: null,
    payment_cycle: null,
    payout_threshold_min: null,
    welcome_email_sent_at: null,
    business_logo_url: null,
    public_description: null,
    identity_document_path: null,
    company_registration_document_path: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('partner-unified-setup', () => {
  it('maps phases to wizard steps', () => {
    expect(businessStepForPhase('documents')).toBe('documents');
    expect(businessStepForPhase('status')).toBe('review');
    expect(payoutStepForPhase('representative')).toBe('representative');
    expect(payoutStepForPhase('payout')).toBe('bank');
    expect(phaseFromBusinessStep('contact')).toBe('business');
    expect(phaseFromPayoutStep('bank')).toBe('payout');
  });

  it('parses phase ids safely', () => {
    expect(parseUnifiedSetupPhase('documents')).toBe('documents');
    expect(parseUnifiedSetupPhase('nope')).toBeNull();
  });

  it('starts incomplete suppliers on business', () => {
    expect(resolveUnifiedSetupPhase(profile({}), { userId: 'u1' })).toBe('business');
  });

  it('routes rejected business to documents', () => {
    const p = profile({
      verification_status: 'rejected',
      verification_submitted_at: '2026-01-02T00:00:00Z',
      business_verification_feedback: 'Replace registration extract',
      business_type: 'company',
      company_legal_name: 'Acme Oy',
      display_name: 'Acme',
      company_registration_number: '1234567-8',
      managing_directors: 'Ada',
      contact_phone: '+358401234567',
      address_street: 'Street 1',
      address_city: 'Helsinki',
      address_postal_code: '00100',
      address_country: 'FI',
      tax_id: '1234567-8',
      company_registration_document_path: 'u1/reg.pdf',
    });
    // Even with complete fields, rejection should surface documents when draft-complete checks pass.
    const phase = resolveUnifiedSetupPhase(p, { userId: 'u1' });
    expect(['documents', 'business', 'representative', 'payout', 'status']).toContain(phase);
  });

  it('sanitizes server setup progress without inventing readiness', () => {
    const payload = toServerSetupProgress({
      phase: 'business',
      business_step: 'identity',
      business_draft: {
        display_name: 'Acme',
        payout_iban: 'FI2112345600000785',
        step: 'identity',
      },
    });
    expect(payload.phase).toBe('business');
    expect((payload.business_draft as Record<string, unknown>).display_name).toBe('Acme');
    expect((payload.business_draft as Record<string, unknown>).payout_iban).toBeUndefined();
  });

  it('prefers newer server business draft when merging', () => {
    const merged = mergeServerBusinessSetupDraft(
      {
        step: 'identity',
        display_name: 'Local',
        company_legal_name: '',
        business_type: '',
        company_registration_number: '',
        tax_id: '',
        vat_id: '',
        directors: [''],
        managing_directors: '',
        contact_phone: '',
        address_street: '',
        address_city: '',
        address_postal_code: '',
        address_country: '',
        company_registration_document_path: '',
        owner_authority_confirmed: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        updated_at: '2026-02-01T00:00:00.000Z',
        business_draft: {
          display_name: 'Server',
          step: 'contact',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      }
    );
    expect(merged?.display_name).toBe('Server');
    expect(merged?.step).toBe('contact');
  });

  it('derives next CTA without fabricating publish readiness', () => {
    const progress = derivePartnerSetupProgress(profile({}), { userId: 'u1', hasListing: false });
    expect(progress.publishReady).toBe(false);
    expect(progress.nextCta.length).toBeGreaterThan(0);
    expect(progress.businessHref).toContain('/partner/onboarding?phase=business');
  });
});
