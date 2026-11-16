import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyPayoutWizardDraft, validatePayoutWizardIdentity } from './payout-setup-wizard';
import { STRIPE_RECIPIENT_AGREEMENT, STRIPE_RECIPIENT_DISCLOSURE } from './stripe-recipient-agreement';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const wizard = readFileSync(
  resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
  'utf8'
);
const shared = readFileSync(
  resolve(root, 'supabase/functions/_shared/stripe-recipient-agreement.ts'),
  'utf8'
);
const client = readFileSync(resolve(root, 'src/lib/stripe-recipient-agreement.ts'), 'utf8');

describe('Stripe Recipient Agreement acceptance', () => {
  it('points at Stripe’s recipient notice and privacy policy', () => {
    expect(client).toBe(shared);
    expect(STRIPE_RECIPIENT_AGREEMENT.url).toBe('https://stripe.com/legal/connect-account/recipient');
    expect(STRIPE_RECIPIENT_AGREEMENT.privacyUrl).toBe('https://stripe.com/privacy');
    expect(STRIPE_RECIPIENT_DISCLOSURE).toContain('Stripe Recipient Agreement');
    expect(STRIPE_RECIPIENT_DISCLOSURE).not.toMatch(/Connected Account Agreement/);
  });

  it('starts unchecked and blocks continue until the supplier agrees', () => {
    expect(emptyPayoutWizardDraft().tos_accepted).toBe(false);
    expect(validatePayoutWizardIdentity(emptyPayoutWizardDraft())).toMatch(/Stripe Recipient Agreement/);
    expect(wizard).toContain('tos_accepted: false');
    expect(wizard).toContain('checked={draft.tos_accepted}');
    expect(wizard).not.toContain('checked={true}');
    expect(wizard).toContain('Stripe is asking for this agreement again');
  });

  it('records acceptance before any Stripe update and keeps Express on Stripe’s step', () => {
    const accept = edge.slice(edge.indexOf("action === 'accept_tos'"), edge.indexOf("action === 'attach_bank_token'"));
    const versionAt = accept.indexOf('agreement_version');
    const auditAt = accept.indexOf('supplier_recipient_agreement_accepted');
    const stripeAt = accept.indexOf('stripeV2');
    expect(versionAt).toBeGreaterThan(-1);
    expect(auditAt).toBeGreaterThan(versionAt);
    expect(stripeAt).toBeGreaterThan(auditAt);
    expect(accept).toContain('user_agent');
    expect(accept).toContain("ip === '0.0.0.0'");
    expect(accept).toContain('account_type: \'express\'');
    expect(accept.indexOf("accountType === 'express'")).toBeLessThan(auditAt);
  });
});
