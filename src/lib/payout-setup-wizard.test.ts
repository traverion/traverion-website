import { describe, expect, it } from 'vitest';
import {
  canProvisionConnectAccount,
  emptyBeneficialOwner,
  emptyPayoutWizardDraft,
  isLiveAccountCreationGateError,
  parseOwnershipPercent,
  payoutBankPresentation,
  payoutVerificationPresentation,
  payoutWizardStepForRequirement,
  sanitizeOwnershipPercentInput,
  sumDeclaredOwnershipPercent,
  summarizePayoutWizardLocalProgress,
  validateBeneficialOwners,
  validateOwnershipPercent,
  validatePayoutBusinessFromProfile,
  validatePayoutWizardRepresentative,
  validatePayoutWizardRepresentativeFields,
} from './payout-setup-wizard';

describe('payout wizard local progress summary', () => {
  it('never treats completion as provider verification', () => {
    expect(summarizePayoutWizardLocalProgress(null).hasSavedProgress).toBe(false);
    const draft = emptyPayoutWizardDraft({
      businessSavedAt: '2026-01-01T00:00:00.000Z',
      bankSavedAt: '2026-01-01T00:00:00.000Z',
      wizardCompletedAt: '2026-01-02T00:00:00.000Z',
      step: 'review',
    });
    const summary = summarizePayoutWizardLocalProgress(draft);
    expect(summary.wizardCompleted).toBe(true);
    expect(summary.bankSavedLocally).toBe(true);
    expect(summary.bankDeferred).toBe(false);
    expect(summary.savedStepCount).toBe(2);
    expect(summary.lastStep).toBe('review');
  });

  it('treats deferred bank continue as not saved to provider', () => {
    const draft = emptyPayoutWizardDraft({
      bankDeferredAt: '2026-01-01T00:00:00.000Z',
      wizardCompletedAt: '2026-01-02T00:00:00.000Z',
    });
    const summary = summarizePayoutWizardLocalProgress(draft);
    expect(summary.bankSavedLocally).toBe(false);
    expect(summary.bankDeferred).toBe(true);
    expect(
      payoutBankPresentation({ bankManaged: false, localProgress: summary })
    ).toBe('Not sent to provider');
    expect(
      payoutVerificationPresentation({
        connectLabel: 'Not started',
        hasConnectedAccount: false,
        localProgress: summary,
      })
    ).toBe('Details saved — connection not enabled');
    expect(
      payoutVerificationPresentation({
        connectLabel: 'Verified',
        hasConnectedAccount: true,
        localProgress: summary,
      })
    ).toBe('Verified');
  });
});

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

  it('validates multi-owner totals without assuming 100% single owner', () => {
    const draft = emptyPayoutWizardDraft({
      rep_first_name: 'Ada',
      rep_last_name: 'Lovelace',
      rep_dob: '1990-01-01',
      rep_is_owner: true,
      rep_percent_ownership: '40',
      beneficial_owners: [
        emptyBeneficialOwner({
          first_name: 'Grace',
          last_name: 'Hopper',
          dob: '1985-05-05',
          percent_ownership: '35',
        }),
        emptyBeneficialOwner({
          first_name: 'Alan',
          last_name: 'Turing',
          dob: '1988-06-06',
          percent_ownership: '25',
        }),
      ],
    });
    expect(sumDeclaredOwnershipPercent(draft)).toBe(100);
    expect(validateBeneficialOwners(draft)).toBeNull();
    expect(validatePayoutWizardRepresentative(draft)).toBeNull();
    expect(
      validateBeneficialOwners({
        ...draft,
        beneficial_owners: [
          ...draft.beneficial_owners,
          emptyBeneficialOwner({
            first_name: 'Extra',
            last_name: 'Owner',
            dob: '1991-01-01',
            percent_ownership: '1',
          }),
        ],
      })
    ).toMatch(/cannot exceed 100/i);
  });

  it('allows representative without ownership and no owners', () => {
    const draft = emptyPayoutWizardDraft({
      rep_first_name: 'Ada',
      rep_last_name: 'Lovelace',
      rep_dob: '1990-01-01',
      rep_is_owner: false,
      beneficial_owners: [],
    });
    expect(validatePayoutWizardRepresentative(draft)).toBeNull();
    expect(sumDeclaredOwnershipPercent(draft)).toBe(0);
  });

  it('requires complete business profile before payout continue', () => {
    expect(validatePayoutBusinessFromProfile(null)).toMatch(/legal company name/i);
    expect(
      validatePayoutBusinessFromProfile({
        company_legal_name: 'Acme Oy',
        business_type: 'company',
        address_street: 'Street 1',
        address_city: 'Helsinki',
        address_postal_code: '00100',
        address_country: 'FI',
      })
    ).toBeNull();
  });

  it('provisions Connect only on TEST or existing account', () => {
    expect(
      canProvisionConnectAccount({ hasConnectedAccount: false, platformEnvironment: 'live' })
    ).toBe(false);
    expect(
      canProvisionConnectAccount({ hasConnectedAccount: false, platformEnvironment: 'test' })
    ).toBe(true);
    expect(
      canProvisionConnectAccount({ hasConnectedAccount: true, platformEnvironment: 'live' })
    ).toBe(true);
  });

  it('maps director requirements to business (SoT), owners to representative', () => {
    expect(payoutWizardStepForRequirement('company.directors_provided')).toBe('business');
    expect(payoutWizardStepForRequirement('directors.first_name')).toBe('business');
    expect(payoutWizardStepForRequirement('owners.percent_ownership')).toBe('representative');
    expect(payoutWizardStepForRequirement('representative.first_name')).toBe('representative');
  });
});
