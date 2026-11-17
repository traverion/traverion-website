import { describe, expect, it } from 'vitest';
import {
  emptyPayoutWizardDraft,
  isLiveAccountCreationGateError,
  parseOwnershipPercent,
  sanitizeOwnershipPercentInput,
  validateOwnershipPercent,
  validatePayoutWizardRepresentative,
  validatePayoutWizardRepresentativeFields,
} from './payout-setup-wizard';

describe('ownership percent validation', () => {
  it('accepts 0–100 including decimals and rejects junk', () => {
    expect(parseOwnershipPercent('0')).toBe(0);
    expect(parseOwnershipPercent('100')).toBe(100);
    expect(parseOwnershipPercent('25.5')).toBe(25.5);
    expect(parseOwnershipPercent('25,5')).toBe(25.5);
    expect(parseOwnershipPercent('-1')).toBeNull();
    expect(parseOwnershipPercent('101')).toBeNull();
    expect(parseOwnershipPercent('abc')).toBeNull();
    expect(parseOwnershipPercent('12.345')).toBeNull();
  });

  it('sanitizes input to digits and one decimal', () => {
    expect(sanitizeOwnershipPercentInput('12a3')).toBe('123');
    expect(sanitizeOwnershipPercentInput('12.3.4')).toBe('12.34');
    expect(sanitizeOwnershipPercentInput('50%')).toBe('50');
  });

  it('requires ownership when representative is an owner', () => {
    const draft = emptyPayoutWizardDraft({
      rep_first_name: 'Ada',
      rep_last_name: 'Lovelace',
      rep_dob: '1990-01-01',
      rep_is_owner: true,
      rep_percent_ownership: '',
    });
    expect(validatePayoutWizardRepresentative(draft)).toMatch(/ownership/i);
    expect(validatePayoutWizardRepresentativeFields(draft).rep_percent_ownership).toMatch(
      /ownership/i
    );
    expect(
      validatePayoutWizardRepresentative({ ...draft, rep_percent_ownership: '100' })
    ).toBeNull();
    expect(
      validatePayoutWizardRepresentative({
        ...draft,
        rep_is_owner: false,
        rep_percent_ownership: '',
      })
    ).toBeNull();
  });

  it('detects LIVE gate errors', () => {
    expect(isLiveAccountCreationGateError('LIVE payout account creation is turned off.')).toBe(
      true
    );
    expect(validateOwnershipPercent('abc')).toMatch(/numbers only/i);
  });
});
