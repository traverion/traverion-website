import { describe, expect, it } from 'vitest';
import { payoutAvailabilityCopy, supplierVerificationState } from './supplier-verification-state';

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
});
