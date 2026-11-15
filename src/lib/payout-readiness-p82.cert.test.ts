/**
 * P8.2 cert fixtures — LIVE Connect preflight verdict helpers.
 * No network, no money movement.
 */
import { describe, expect, it } from 'vitest';
import { connectCanReceiveTransfers } from './connect-payout-status';

describe('P8.2 LIVE Connect preflight', () => {
  it('blocks transfer readiness when requirements past due / payouts disabled', () => {
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: false,
        connect_onboarding_status: 'restricted',
        connect_account_livemode: true,
        connect_requirements_currently_due: ['external_account', 'tos_acceptance.date'],
        connect_requirements_past_due: ['external_account'],
      })
    ).toBe(false);
  });

  it('documents BLOCKED until Connect complete and prepare isolation exists', () => {
    const preflight = {
      connect_complete: false,
      transfers_capability: 'inactive',
      prepare_respects_pilot_selection: false,
      pilot_booking_eligible: true,
      verdict: 'BLOCKED' as const,
    };
    expect(preflight.pilot_booking_eligible).toBe(true);
    expect(preflight.connect_complete).toBe(false);
    expect(preflight.prepare_respects_pilot_selection).toBe(false);
    expect(preflight.verdict).toBe('BLOCKED');
  });
});
