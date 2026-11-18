import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'src');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('P9.40 unified supplier onboarding cert', () => {
  it('exposes one progress model and five phases', () => {
    const lib = read('lib/partner-unified-setup.ts');
    expect(lib).toContain("id: 'business'");
    expect(lib).toContain("id: 'documents'");
    expect(lib).toContain("id: 'representative'");
    expect(lib).toContain("id: 'payout'");
    expect(lib).toContain("id: 'status'");
    expect(lib).toContain('derivePartnerSetupProgress');
    expect(lib).toContain('toServerSetupProgress');
    expect(lib).not.toContain('payout_iban');
  });

  it('wires Finish setup hub into phase routing', () => {
    const layout = read('components/supplier/SupplierLayout.tsx');
    const hub = read('pages/supplier/PartnerOnboarding.tsx');
    expect(hub).toContain('onContinuePhase');
    expect(hub).toContain('UNIFIED_SETUP_SCREENS');
    expect(layout).toContain('continueUnifiedPhase');
    expect(layout).toContain('business-setup?step=');
    expect(layout).toContain('verification?step=');
  });

  it('continues business submit into payout representative step', () => {
    const page = read('pages/supplier/BusinessSetupPage.tsx');
    expect(page).toContain('verification?step=representative');
    expect(page).toContain('onSubmitted={continueToPayouts}');
  });

  it('returns verification close to onboarding and honors step deep links', () => {
    const page = read('pages/supplier/SupplierVerificationPage.tsx');
    expect(page).toContain("PARTNER_APP_BASE}/onboarding");
    expect(page).toContain('resolveInitialStep');
    expect(page).toContain("params.get('step')");
  });

  it('persists non-sensitive setup_progress from both wizards', () => {
    const business = read('components/supplier/BusinessOnboardingWizard.tsx');
    const payout = read('components/supplier/PayoutSetupWizard.tsx');
    const data = read('data/supabase-supplier-profile.ts');
    expect(data).toContain('updateSupplierSetupProgress');
    expect(business).toContain('updateSupplierSetupProgress');
    expect(business).toContain('mergeServerBusinessSetupDraft');
    expect(payout).toContain('updateSupplierSetupProgress');
    expect(payout).toContain('phaseFromPayoutStep');
  });

  it('routes dashboard action items into the unified flow', () => {
    const dash = read('pages/supplier/SupplierDashboard.tsx');
    expect(dash).toContain('business-setup?step=documents');
    expect(dash).toContain('verification?step=representative');
    expect(dash).not.toContain('business-profile#company');
  });
});
