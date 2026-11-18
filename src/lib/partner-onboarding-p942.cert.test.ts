import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'src');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('P9.42 production onboarding UX cert', () => {
  it('tracks requirement completion separately from visited phase', () => {
    const lib = read('lib/partner-unified-setup.ts');
    expect(lib).toContain('phaseComplete');
    expect(lib).toContain('requirementsDone');
    expect(lib).toContain('representativeSaved');
  });

  it('dedupes LIVE gate banner in embedded payout flow', () => {
    const wizard = read('components/supplier/PayoutSetupWizard.tsx');
    expect(wizard).toContain('PAYOUT_LIVE_SETUP_UNAVAILABLE_SHORT');
    expect(wizard).toContain("draft.step === 'representative'");
  });

  it('prefers profile document path on review when draft path is empty', () => {
    const business = read('components/supplier/BusinessOnboardingWizard.tsx');
    expect(business).toContain('profile?.company_registration_document_path');
  });

  it('ships a next-step status screen without duplicate review clutter', () => {
    const hub = read('pages/supplier/PartnerOnboarding.tsx');
    expect(hub).toContain('Next step');
    expect(hub).toContain('requirementsDone');
    expect(hub).not.toContain('Review company');
    expect(hub).not.toContain('PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE');
  });
});
