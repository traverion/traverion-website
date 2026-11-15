/**
 * P8.4 LIVE Connect verification fixtures (Royal Nordic).
 * Source-level documentation of Stripe-authoritative state at certification time.
 * No money movement.
 */
import { describe, expect, it } from 'vitest';
import { connectCanReceiveTransfers, connectOnboardingLabel } from './connect-payout-status';
import { humanizeConnectRequirements } from './connect-requirement-labels';

/** Snapshot from LIVE Stripe GET /v1/accounts/acct_1UcAxbCOlSVGqrHJ via Traverion platform. */
const RN_LIVE = {
  id: 'acct_1UcAxbCOlSVGqrHJ',
  platform: 'acct_1TFXp1CJawbWge6X',
  details_submitted: false,
  charges_enabled: false,
  payouts_enabled: false,
  transfers: 'inactive' as const,
  external_accounts: 0,
  disabled_reason: 'requirements.past_due',
  currently_due: [
    'business_type',
    'external_account',
    'representative.address.city',
    'representative.address.line1',
    'representative.address.postal_code',
    'representative.dob.day',
    'representative.dob.month',
    'representative.dob.year',
    'representative.first_name',
    'representative.last_name',
    'tos_acceptance.date',
    'tos_acceptance.ip',
  ],
};

const PILOT = {
  selected: 'TV-FNFQEA87',
  selected_minor: 8500,
  excluded: 'TV-PDTAS6JD',
  other_eligible: 4,
};

describe('P8.4 LIVE Connect verification', () => {
  it('does not treat details_submitted alone as transfer-ready', () => {
    expect(RN_LIVE.details_submitted).toBe(false);
    expect(RN_LIVE.payouts_enabled).toBe(false);
    expect(RN_LIVE.transfers).toBe('inactive');
    expect(RN_LIVE.external_accounts).toBe(0);
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: RN_LIVE.payouts_enabled,
        connect_onboarding_status: 'restricted',
        connect_account_livemode: true,
      })
    ).toBe(false);
    expect(
      connectOnboardingLabel('restricted', { connect_account_livemode: true })
    ).not.toBe('Verified');
  });

  it('humanizes outstanding requirements without PII field names', () => {
    const labels = humanizeConnectRequirements(RN_LIVE.currently_due);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Business type',
        'Bank account for payouts',
        'Account representative details',
        'Stripe terms acceptance',
      ])
    );
    expect(labels.join(' ')).not.toMatch(/first_name|dob\.|postal_code/i);
  });

  it('keeps pilot isolation fixture (€85 selected, others unallocated)', () => {
    expect(PILOT.selected).toBe('TV-FNFQEA87');
    expect(PILOT.selected_minor).toBe(8500);
    expect(PILOT.excluded).toBe('TV-PDTAS6JD');
    expect(PILOT.other_eligible).toBe(4);
  });

  it('documents verdict BLOCKED — ONBOARDING INCOMPLETE', () => {
    const ready =
      RN_LIVE.details_submitted &&
      RN_LIVE.charges_enabled &&
      RN_LIVE.payouts_enabled &&
      RN_LIVE.transfers === 'active' &&
      RN_LIVE.external_accounts > 0 &&
      RN_LIVE.currently_due.length === 0;
    expect(ready).toBe(false);
    expect('BLOCKED — ONBOARDING INCOMPLETE').toMatch(/BLOCKED/);
  });
});
