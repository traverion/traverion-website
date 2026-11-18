import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'src');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('P9.41 seamless onboarding integration cert', () => {
  it('hosts company and payout wizards inside one onboarding shell', () => {
    const hub = read('pages/supplier/PartnerOnboarding.tsx');
    expect(hub).toContain('partner-unified-setup-shell');
    expect(hub).toContain('variant="embedded"');
    expect(hub).toContain('BusinessOnboardingWizard');
    expect(hub).toContain('PayoutSetupWizard');
    expect(hub).toContain("phase === 'status'");
  });

  it('embeds wizards without fixed fullscreen chrome', () => {
    const business = read('components/supplier/BusinessOnboardingWizard.tsx');
    const payout = read('components/supplier/PayoutSetupWizard.tsx');
    expect(business).toContain("variant === 'embedded'");
    expect(business).toContain('partner-setup-embed');
    expect(payout).toContain("variant === 'embedded'");
    expect(payout).toContain('partner-setup-embed');
    expect(payout).toContain('onBackToPreviousPhase');
  });

  it('routes legacy setup URLs into onboarding phases', () => {
    const layout = read('components/supplier/SupplierLayout.tsx');
    const businessPage = read('pages/supplier/BusinessSetupPage.tsx');
    const verificationPage = read('pages/supplier/SupplierVerificationPage.tsx');
    const dash = read('pages/supplier/SupplierDashboard.tsx');
    expect(layout).toContain('onboarding?phase=');
    expect(businessPage).toContain('onboarding?phase=');
    expect(verificationPage).toContain('onboarding?phase=');
    expect(dash).toContain('onboarding?phase=representative');
    expect(dash).toContain('onboarding?phase=documents');
  });

  it('keeps Income settings fullscreen payout wizard for management', () => {
    const settings = read('components/supplier/IncomeFinancialSettings.tsx');
    expect(settings).toContain('PayoutSetupWizard');
    expect(settings).not.toContain('variant="embedded"');
  });
});
