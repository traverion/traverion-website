import { describe, expect, it } from 'vitest';
import {
  partnerAccountStatus,
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
  partnerPayoutReviewState,
  partnerPayoutStatusChip,
} from './partnerVerificationStatus';

describe('partnerVerificationStatus', () => {
  it('maps business and payout review states', () => {
    expect(
      partnerBusinessReviewState({ verificationStatus: 'verified' })
    ).toBe('verified');
    expect(
      partnerBusinessReviewState({
        verificationStatus: 'pending',
        submittedAt: '2026-01-01',
      })
    ).toBe('pending');
    expect(
      partnerBusinessReviewState({ verificationStatus: 'rejected' })
    ).toBe('rejected');
    expect(
      partnerBusinessReviewState({ verificationStatus: '', draftComplete: true })
    ).toBe('ready');
    expect(partnerPayoutReviewState({ verificationStatus: '', hasBankDetails: true })).toBe(
      'ready'
    );
  });

  it('uses clear badge labels for pending, rejected, and approved', () => {
    expect(partnerBusinessStatusChip('pending').label.toLowerCase()).toContain('pending');
    expect(partnerBusinessStatusChip('pending').tone).toBe('warn');
    expect(partnerPayoutStatusChip('rejected').tone).toBe('bad');
    expect(partnerBusinessStatusChip('verified').tone).toBe('good');
    expect(partnerPayoutStatusChip('verified').label.toLowerCase()).toContain('approved');
  });

  it('reports account operational only when both are verified', () => {
    const ops = partnerAccountStatus({ business: 'verified', payout: 'verified' });
    expect(ops.kind).toBe('operational');
    expect(ops.title.toLowerCase()).toContain('operational');
    expect(ops.tone).toBe('good');

    const pending = partnerAccountStatus({ business: 'pending', payout: 'verified' });
    expect(pending.kind).toBe('pending');
    expect(pending.chipLabel.toLowerCase()).toContain('pending');

    const rejected = partnerAccountStatus({ business: 'verified', payout: 'rejected' });
    expect(rejected.kind).toBe('rejected');
    expect(rejected.detail.toLowerCase()).toContain('payout');
  });
});
