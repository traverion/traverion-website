import { describe, expect, it } from 'vitest';
import {
  partnerAccountStatus,
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
  partnerPayoutReviewState,
  partnerPayoutStatusChip,
  partnerReviewStatusChip,
} from './partnerVerificationStatus';

describe('partnerVerificationStatus', () => {
  it('maps business and payout review states', () => {
    expect(partnerBusinessReviewState({ verificationStatus: 'verified' })).toBe('verified');
    expect(
      partnerBusinessReviewState({
        verificationStatus: 'pending',
        submittedAt: '2026-01-01',
      })
    ).toBe('pending');
    expect(partnerBusinessReviewState({ verificationStatus: 'rejected' })).toBe('rejected');
    expect(
      partnerBusinessReviewState({
        verificationStatus: 'pending',
        submittedAt: '2026-01-01',
        feedback: 'Replace marketing poster with PRH extract.',
      })
    ).toBe('rejected');
    expect(
      partnerBusinessReviewState({ verificationStatus: '', draftComplete: true })
    ).toBe('ready');
    expect(partnerPayoutReviewState({ verificationStatus: '', hasBankDetails: true })).toBe(
      'ready'
    );
  });

  it('uses supplier-friendly status labels only', () => {
    expect(partnerReviewStatusChip('incomplete').label).toBe('Incomplete');
    expect(partnerReviewStatusChip('ready').label).toBe('Incomplete');
    expect(partnerBusinessStatusChip('pending').label).toBe('Under review');
    expect(partnerBusinessStatusChip('pending').tone).toBe('warn');
    expect(partnerPayoutStatusChip('rejected').label).toBe('Action required');
    expect(partnerPayoutStatusChip('rejected').tone).toBe('bad');
    expect(partnerBusinessStatusChip('verified').label).toBe('Verified');
    expect(partnerBusinessStatusChip('verified').tone).toBe('good');
    expect(partnerPayoutStatusChip('verified').label).toBe('Verified');
  });

  it('reports account operational only when both are verified', () => {
    const ops = partnerAccountStatus({ business: 'verified', payout: 'verified' });
    expect(ops.kind).toBe('operational');
    expect(ops.chipLabel).toBe('Verified');
    expect(ops.tone).toBe('good');

    const pending = partnerAccountStatus({ business: 'pending', payout: 'verified' });
    expect(pending.kind).toBe('pending');
    expect(pending.chipLabel).toBe('Under review');

    const rejected = partnerAccountStatus({ business: 'verified', payout: 'rejected' });
    expect(rejected.kind).toBe('rejected');
    expect(rejected.chipLabel).toBe('Action required');
    expect(rejected.detail.toLowerCase()).toContain('payout');

    const setup = partnerAccountStatus({ business: 'incomplete', payout: 'incomplete' });
    expect(setup.chipLabel).toBe('Incomplete');
  });
});
