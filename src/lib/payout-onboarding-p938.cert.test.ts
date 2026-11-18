import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const wizard = readFileSync(resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'), 'utf8');
const lib = readFileSync(resolve(root, 'src/lib/payout-setup-wizard.ts'), 'utf8');
const settings = readFileSync(
  resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
  'utf8'
);
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);

describe('P9.38 payout onboarding completion cert', () => {
  it('hydrates server draft before writing back (no overwrite race)', () => {
    expect(wizard).toContain('serverHydrated');
    expect(wizard).toMatch(/if\s*\(\s*!serverHydrated\s*\)\s*return/);
    expect(wizard).toContain('mergeServerPayoutWizardDraft');
    expect(wizard).toContain('wizard_draft_updated_at');
    expect(wizard).toContain("save_wizard_draft");
  });

  it('keeps four honest readiness lanes and never claims device-only SoT', () => {
    expect(lib).toContain('buildPayoutReadinessLanes');
    expect(lib).toContain('traverionBusinessVerificationLabel');
    expect(lib).toMatch(/Traverion account/);
    expect(wizard).toContain('Form progress');
    expect(wizard).toContain('Traverion business');
    expect(wizard).toContain('Stripe verification');
    expect(wizard).toContain('Payout readiness');
    expect(wizard).toContain('Saved to your account');
    expect(wizard).not.toMatch(/Saved on this device/);
    expect(settings).toContain('buildPayoutReadinessLanes');
    expect(settings).not.toMatch(/saved on this device/i);
  });

  it('wires Stripe Account Link for authorized connect without flipping LIVE gates', () => {
    expect(wizard).toContain('fetchConnectAccountLink');
    expect(wizard).toContain('launchHostedStripe');
    expect(wizard).toContain('canProvisionConnectAccount');
    expect(edge).toContain('live_custom_onboarding_enabled');
    expect(edge).toContain('live_accounts_v2_pilot_approvals');
    expect(edge).toContain('assertLiveCustomCreateAllowed');
  });

  it('clears progress on server when supplier clears draft', () => {
    expect(wizard).toContain('emptyServerPayoutWizardDraft');
    expect(wizard).toContain('Clear saved progress');
  });
});
