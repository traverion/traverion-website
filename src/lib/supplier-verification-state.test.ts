import { describe, expect, it } from 'vitest';
import {
  payoutAvailabilityCopy,
  supplierBankAccountCopy,
  supplierOperationalIndicators,
  supplierVerificationState,
} from './supplier-verification-state';

const verifiedAccount = {
  verification_status: 'verified',
  stripe_connected_account_id: 'acct_test',
  connect_details_submitted: true,
  connect_payouts_enabled: true,
  connect_onboarding_status: 'complete',
  connect_account_livemode: true,
  connect_requirements_currently_due: [],
  connect_requirements_past_due: [],
};

describe('supplier verification state', () => {
  it('is not verified before anything has been submitted', () => {
    const view = supplierVerificationState({});
    expect(view.status).toBe('not_verified');
    expect(view.title).toBe('Not verified');
    expect(view.actionLabel).toBe('Start verification');
  });

  it('asks for action when requirements are still open', () => {
    const view = supplierVerificationState({
      ...verifiedAccount,
      connect_payouts_enabled: false,
      connect_onboarding_status: 'restricted',
      connect_requirements_currently_due: ['external_account', 'tos_acceptance.date'],
    });
    expect(view.status).toBe('action_required');
    expect(view.summary).toBe('We need some additional information to complete your verification.');
    expect(view.requirements).toContain('Bank account required');
    expect(view.requirements).toContain('Accept payout terms');
  });

  it('stays pending after submission until the payout account is approved', () => {
    const view = supplierVerificationState({
      ...verifiedAccount,
      connect_payouts_enabled: false,
      connect_onboarding_status: 'pending',
    });
    expect(view.status).toBe('verification_pending');
    expect(view.title).toBe('Verification pending');
    expect(view.actionLabel).toBeNull();
  });

  it('is verified only when company, identity, and the payout account have passed', () => {
    const view = supplierVerificationState(verifiedAccount);
    expect(view.status).toBe('verified');
    expect(view.summary).toBe('Your business is verified and your payout account is approved.');
  });

  it('does not call a test account or an open payout requirement verified', () => {
    expect(
      supplierVerificationState({ ...verifiedAccount, connect_account_livemode: false }).status
    ).not.toBe('verified');
    expect(
      supplierVerificationState({
        ...verifiedAccount,
        connect_requirements_currently_due: ['external_account'],
      }).status
    ).toBe('action_required');
  });

  it('does not promise payouts while financial gates are closed', () => {
    expect(payoutAvailabilityCopy('verified', false)).toBe(
      'Your payout account is approved. Payouts are not being sent yet.'
    );
    expect(payoutAvailabilityCopy('verification_pending', true)).toBe(
      'Payouts are not available until verification is complete.'
    );
  });

  it('marks the account operational without marking payouts operational while gates are closed', () => {
    const view = supplierOperationalIndicators(verifiedAccount, false);
    expect(view.account.operational).toBe(true);
    expect(view.account.headline).toBe('Account operational');
    expect(view.account.actionLabel).toBeNull();
    expect(view.payouts.operational).toBe(false);
    expect(view.payouts.kind).toBe('closed');
    expect(view.payouts.detail).toBe('Your payout account is approved. Payouts are not being sent yet.');
    expect(view.payouts.actionLabel).toBeNull();
  });

  it('marks payouts operational only when verification, provider capability, and gates all allow it', () => {
    const open = supplierOperationalIndicators(verifiedAccount, true);
    expect(open.account.operational).toBe(true);
    expect(open.payouts.operational).toBe(true);
    expect(open.payouts.headline).toBe('Payouts operational');
    expect(supplierOperationalIndicators({ ...verifiedAccount, connect_payouts_enabled: false }, true).payouts.operational).toBe(
      false
    );
  });

  it('keeps pending and restricted accounts non-operational without a false payout approval', () => {
    const pending = supplierOperationalIndicators(
      { ...verifiedAccount, connect_payouts_enabled: false, connect_onboarding_status: 'pending' },
      true
    );
    expect(pending.account.operational).toBe(false);
    expect(pending.account.kind).toBe('pending');
    expect(pending.account.actionLabel).toBeNull();
    expect(pending.payouts.kind).toBe('pending');

    const restricted = supplierOperationalIndicators(
      {
        ...verifiedAccount,
        connect_payouts_enabled: false,
        connect_onboarding_status: 'restricted',
        connect_requirements_currently_due: ['external_account'],
      },
      true
    );
    expect(restricted.account.kind).toBe('restricted');
    expect(restricted.account.actionLabel).toBe('Continue');
    expect(restricted.payouts.operational).toBe(false);
    expect(restricted.payouts.kind).toBe('restricted');
  });

  it('asks the supplier to continue only when verification has not started or still needs their input', () => {
    expect(supplierOperationalIndicators({}, false).account.actionLabel).toBe('Continue');
    expect(supplierOperationalIndicators({}, false).account.kind).toBe('action');
  });

  it('does not treat a connected account with an empty legacy bank field as an approved account number', () => {
    expect(supplierBankAccountCopy({ ...verifiedAccount, payout_iban: '' }).label).toBe('Connected');
    expect(supplierBankAccountCopy({ ...verifiedAccount, payout_iban: '' }).number).toBeNull();
    expect(
      supplierBankAccountCopy({
        ...verifiedAccount,
        connect_payouts_enabled: false,
        connect_onboarding_status: 'pending',
        payout_iban: null,
      }).label
    ).toBe('Not confirmed');
    expect(supplierBankAccountCopy({ payout_iban: null }).label).toBe('Not added');
  });
});
