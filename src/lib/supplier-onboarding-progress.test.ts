import { describe, expect, it } from 'vitest';
import {
  supplierOnboardingSnapshot,
  supplierSetupMenuLabel,
} from './supplier-onboarding-progress';

const verifiedCompany = {
  verification_status: 'verified',
  company_legal_name: 'Example Oy',
  company_registration_document_path: 'docs/file.pdf',
  stripe_connected_account_id: 'acct_test',
  connect_details_submitted: false,
  connect_payouts_enabled: false,
};

describe('supplier onboarding progress', () => {
  it('resumes at the first open identity requirement, not company confirmation', () => {
    const snapshot = supplierOnboardingSnapshot({
      ...verifiedCompany,
      connect_requirements_currently_due: ['directors.dob.day', 'directors.first_name', 'external_account', 'tos_acceptance.date'],
      payout_wizard_draft: { step: 'business', rep: { first_name: 'Ada', last_name: 'Lovelace' }, markers: {} },
    });
    expect(snapshot.company.status).toBe('verified');
    expect(snapshot.identity.status).toBe('action_required');
    expect(snapshot.identity.detail).toBe('Director date of birth');
    expect(snapshot.payout.status).toBe('action_required');
    expect(snapshot.nextScreen).toBe('dob');
    expect(snapshot.actionable).toBe(true);
    expect(supplierSetupMenuLabel(snapshot)).toBe('Director date of birth');
  });

  it('asks for the bank account without repeating terms when only the bank is open', () => {
    const snapshot = supplierOnboardingSnapshot({
      ...verifiedCompany,
      connect_requirements_currently_due: ['external_account'],
      payout_wizard_draft: { rep: { first_name: 'Ada', last_name: 'Lovelace' }, tos_accepted_intent: true },
    });
    expect(snapshot.nextScreen).toBe('bank');
    expect(snapshot.payout.detail).toBe('Bank account required');
    expect(snapshot.identity.status).not.toBe('action_required');
  });

  it('says verification pending when nothing is left for the supplier to send', () => {
    const snapshot = supplierOnboardingSnapshot({
      ...verifiedCompany,
      connect_details_submitted: true,
      connect_requirements_currently_due: [],
      connect_requirements_past_due: [],
    });
    expect(snapshot.actionable).toBe(false);
    expect(snapshot.nextScreen).toBe('status');
    expect(snapshot.identity.status).toBe('pending_verification');
    expect(supplierSetupMenuLabel(snapshot)).toBe('Verification pending');
  });

  it('does not call a rejected company verified', () => {
    const snapshot = supplierOnboardingSnapshot({
      verification_status: 'rejected',
      business_verification_feedback: 'Replace the document',
    });
    expect(snapshot.company.status).toBe('rejected');
    expect(snapshot.nextScreen).toBe('documents');
  });
});
