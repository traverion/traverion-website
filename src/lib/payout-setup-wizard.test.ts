import { describe, expect, it } from 'vitest';
import {
  buildPayoutReadinessLanes,
  canProvisionConnectAccount,
  emptyBeneficialOwner,
  emptyPayoutWizardDraft,
  isLiveAccountCreationGateError,
  isOnboardingResetDraft,
  mergeServerPayoutWizardDraft,
  serverDraftSupersedesLocal,
  parseOwnershipPercent,
  payoutBankPresentation,
  payoutVerificationPresentation,
  payoutWizardStepForRequirement,
  sanitizeDevicePayoutWizardDraft,
  nextOwnershipPercentInput,
  ownershipPercentForDraft,
  sanitizeOwnershipPercentInput,
  sumDeclaredOwnershipPercent,
  summarizePayoutWizardLocalProgress,
  toServerPayoutWizardDraft,
  traverionBusinessVerificationLabel,
  validateBeneficialOwners,
  validateIban,
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
    ).toBe('Not submitted yet');
    expect(
      payoutBankPresentation({
        bankManaged: false,
        localProgress: summary,
        connectSetupUnavailable: true,
        hasConnectedAccount: false,
      })
    ).toBe('Saved for later — not submitted yet');
    expect(
      payoutVerificationPresentation({
        connectLabel: 'Not started',
        hasConnectedAccount: false,
        localProgress: summary,
      })
    ).toBe('Details saved — verification not started');
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
    expect(sanitizeOwnershipPercentInput('12a3')).toBe('12');
    expect(sanitizeOwnershipPercentInput('12.3.4')).toBe('12.34');
    expect(sanitizeOwnershipPercentInput('50%')).toBe('50');
    expect(sanitizeOwnershipPercentInput('-5')).toBe('5');
    expect(sanitizeOwnershipPercentInput('33,5')).toBe('33.5');
    expect(sanitizeOwnershipPercentInput('100')).toBe('100');
    expect(sanitizeOwnershipPercentInput('100.5')).toBe('100');
    expect(sanitizeOwnershipPercentInput('0')).toBe('0');
    expect(sanitizeOwnershipPercentInput('0.5')).toBe('0.5');
  });

  it('keeps an over-cap keystroke out of the field and requires a share above 0', () => {
    expect(nextOwnershipPercentInput('100', '1001')).toEqual({
      value: '100',
      error: 'Ownership cannot be more than 100%.',
    });
    expect(nextOwnershipPercentInput('', '33.5%')).toEqual({ value: '33.5', error: null });
    expect(nextOwnershipPercentInput('40', 'abc')).toEqual({
      value: '40',
      error: 'Use numbers only (for example 25 or 25.5).',
    });
    expect(nextOwnershipPercentInput('', '0')).toEqual({
      value: '0',
      error: 'Enter an ownership percentage greater than 0 and up to 100.',
    });
    expect(nextOwnershipPercentInput('', '-1')).toEqual({ value: '1', error: null });
    expect(validateOwnershipPercent('0', { required: true })).toMatch(/greater than 0/);
    expect(validateOwnershipPercent('100', { required: true })).toBeNull();
    expect(validateOwnershipPercent('33.5', { required: true })).toBeNull();
    expect(ownershipPercentForDraft('33.5', true)).toBe('33.5');
    expect(ownershipPercentForDraft('0', true)).toBe('');
    expect(ownershipPercentForDraft('150', true)).toBe('');
    expect(ownershipPercentForDraft('33.5', false)).toBe('');
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

  it('provisions Connect on TEST, existing account, or LIVE when allowlisted+gated', () => {
    expect(
      canProvisionConnectAccount({ hasConnectedAccount: false, platformEnvironment: 'live' })
    ).toBe(false);
    expect(
      canProvisionConnectAccount({
        hasConnectedAccount: false,
        platformEnvironment: 'live',
        liveCreateAllowed: false,
      })
    ).toBe(false);
    expect(
      canProvisionConnectAccount({
        hasConnectedAccount: false,
        platformEnvironment: 'live',
        liveCreateAllowed: true,
      })
    ).toBe(true);
    expect(
      canProvisionConnectAccount({ hasConnectedAccount: false, platformEnvironment: 'test' })
    ).toBe(true);
    expect(
      canProvisionConnectAccount({ hasConnectedAccount: true, platformEnvironment: 'live' })
    ).toBe(true);
  });

  it('strips full DOB from device cache and server draft payload', () => {
    const draft = emptyPayoutWizardDraft({
      rep_first_name: 'Ada',
      rep_dob: '1990-05-15',
      bankLast4: '0785',
    });
    const device = sanitizeDevicePayoutWizardDraft(draft);
    expect(device.rep_dob).toBe('');
    const server = toServerPayoutWizardDraft(draft);
    expect((server.rep as { dob_year?: number }).dob_year).toBe(1990);
    expect(JSON.stringify(server)).not.toMatch(/1990-05-15/);
    expect(JSON.stringify(server)).not.toMatch(/iban/i);
  });

  it('maps director requirements to business (SoT), owners to representative', () => {
    expect(payoutWizardStepForRequirement('company.directors_provided')).toBe('business');
    expect(payoutWizardStepForRequirement('directors.first_name')).toBe('business');
    expect(payoutWizardStepForRequirement('owners.percent_ownership')).toBe('representative');
    expect(payoutWizardStepForRequirement('representative.first_name')).toBe('representative');
  });

  it('keeps Traverion business verification separate from Stripe and form progress', () => {
    expect(traverionBusinessVerificationLabel('verified')).toBe('Approved');
    expect(traverionBusinessVerificationLabel('pending')).toBe('In review');
    const localProgress = summarizePayoutWizardLocalProgress(
      emptyPayoutWizardDraft({
        businessSavedAt: '2026-01-01T00:00:00.000Z',
        wizardCompletedAt: '2026-01-02T00:00:00.000Z',
      })
    );
    const lanes = buildPayoutReadinessLanes({
      localProgress,
      verificationStatus: 'verified',
      connectLabel: 'Not started',
      hasConnectedAccount: false,
      canReceiveTransfers: false,
      connectLivemode: null,
      connectSetupUnavailable: true,
      liveCreateAllowed: false,
      platformEnvironment: 'live',
    });
    expect(lanes.formProgress).toBe('Setup finished');
    expect(lanes.businessVerification).toBe('Approved');
    expect(lanes.stripeVerification).toBe('Details saved — verification not started');
    expect(lanes.payoutReadiness).toBe('Waiting to connect');
    expect(lanes.nextStep).toMatch(/payout connection opens/i);
  });

  it('prefers richer server draft when merging across devices', () => {
    const local = emptyPayoutWizardDraft({
      step: 'business',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const server = toServerPayoutWizardDraft(
      emptyPayoutWizardDraft({
        step: 'preferences',
        rep_first_name: 'Ada',
        businessSavedAt: '2026-01-02T00:00:00.000Z',
        representativeSavedAt: '2026-01-02T00:00:00.000Z',
        preferencesSavedAt: '2026-01-02T00:00:00.000Z',
      })
    );
    const merged = mergeServerPayoutWizardDraft(local, server, {
      serverUpdatedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(merged.step).toBe('preferences');
    expect(merged.rep_first_name).toBe('Ada');
    expect(merged.businessSavedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('lets a newer empty server draft replace an older browser draft', () => {
    const local = emptyPayoutWizardDraft({
      step: 'review',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rep_first_name: 'Ada',
      rep_last_name: 'Lovelace',
      rep_is_owner: true,
      rep_percent_ownership: '100',
      verification_consent: true,
      wizardCompletedAt: '2026-01-01T00:00:00.000Z',
      representativeSavedAt: '2026-01-01T00:00:00.000Z',
    });
    const server = { version: 1, step: 'business', rep: {}, owners: [], markers: {} };
    expect(serverDraftSupersedesLocal(local.updatedAt, '2026-01-02T00:00:00.000Z')).toBe(true);
    expect(isOnboardingResetDraft(server)).toBe(true);
    const merged = mergeServerPayoutWizardDraft(local, server, {
      serverUpdatedAt: '2026-01-02T00:00:00.000Z',
      localUpdatedAt: local.updatedAt,
    });
    expect(merged.step).toBe('business');
    expect(merged.rep_first_name).toBe('');
    expect(merged.rep_is_owner).toBe(false);
    expect(merged.verification_consent).toBe(false);
    expect(merged.wizardCompletedAt).toBeNull();
    expect(merged.representativeSavedAt).toBeNull();
  });

  it('checks a Finnish IBAN before it can be tokenized', () => {
    expect(validateIban('FI2112345600000785', 'FI')).toBeNull();
    expect(validateIban('FI00 0000 0000 0000 00', 'FI')).toMatch(/doesn’t look right|18 characters/);
    expect(validateIban('', 'FI')).toMatch(/Enter the IBAN/);
  });
});
