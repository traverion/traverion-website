import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getBusinessApprovalBlockers,
  hasGenuineBusinessVerificationEvidence,
} from './supplier-business-approval';
import { assessLiveAccountsV2PilotEligibility } from './live-accounts-v2-pilot-eligibility';
import { getSupplierBusinessProfileMissingReasons } from './supplierOnboarding';

const root = resolve(__dirname, '../..');
const admin = readFileSync(
  resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const businessPage = readFileSync(
  resolve(root, 'src/components/supplier/BusinessProfilePage.tsx'),
  'utf8'
);

const complete = {
  company_legal_name: 'Lapland Trails Oy',
  business_type: 'company',
  address_street: 'Koskikatu 1',
  address_city: 'Rovaniemi',
  address_postal_code: '96200',
  address_country: 'FI',
  contact_phone: '+358401234567',
  company_registration_number: '1234567-8',
  company_registration_document_path: 'supplier-verification/x/doc.pdf',
  verification_submitted_at: '2026-11-17T00:00:00.000Z',
  verification_status: 'pending',
};

describe('supplier business approval integrity', () => {
  it('blocks incomplete new approvals and leaves already-verified rows alone', () => {
    expect(getBusinessApprovalBlockers({ ...complete, company_legal_name: null }).length).toBeGreaterThan(0);
    expect(getBusinessApprovalBlockers({ ...complete, address_country: null }).join(' ')).toMatch(/Country/);
    expect(getBusinessApprovalBlockers({ ...complete, contact_phone: '' }).join(' ')).toMatch(/phone/i);
    expect(getBusinessApprovalBlockers(complete)).toEqual([]);
    expect(admin).toContain('getBusinessApprovalBlockers');
    expect(admin).toContain("reason: 'already_verified'");
    expect(admin).toContain('Supplier profile is incomplete for business approval.');
  });

  it('treats cert-script verified rows without submission evidence as not genuine', () => {
    expect(
      hasGenuineBusinessVerificationEvidence({
        verification_status: 'verified',
        verification_submitted_at: null,
        company_registration_document_path: null,
      })
    ).toBe(false);
    expect(
      hasGenuineBusinessVerificationEvidence({
        verification_status: 'verified',
        verification_submitted_at: '2026-10-07T22:03:08.640Z',
        company_registration_document_path: null,
      })
    ).toBe(true);
    const pilot = assessLiveAccountsV2PilotEligibility(
      {
        id: 'c2dd731a-3001-4bc2-b8ea-7f7dc1ceae09',
        verification_status: 'verified',
        verification_submitted_at: null,
        company_registration_document_path: null,
        company_legal_name: 'Fake Oy',
        business_type: 'company',
        address_country: 'FI',
        contact_phone: '+358401111111',
      },
      { ownerConfirmed: true, stripeVerificationAcknowledged: true }
    );
    expect(pilot.eligible).toBe(false);
    expect(pilot.problems.join(' ')).toMatch(/without a submitted profile/i);
  });

  it('shows registration progress and requires owner confirmation before submit', () => {
    expect(
      getSupplierBusinessProfileMissingReasons({
        display_name: 'Brand',
        company_legal_name: 'Legal Oy',
        business_type: 'company',
        address_street: 'A',
        address_city: 'B',
        address_postal_code: '1',
        address_country: 'FI',
        company_registration_number: '1',
        company_registration_document_path: 'x',
      }).join(' ')
    ).toMatch(/Contact phone/i);
    expect(businessPage).toContain('Profile progress');
    expect(businessPage).toContain('ownerAuthorityConfirmed');
    expect(businessPage).toContain('authorized representative');
    expect(businessPage).toContain('Contact phone');
    expect(businessPage).toContain("label: 'Finland (FI)'");
    expect(businessPage).toContain('!readyToSubmitForReview');
  });
});
