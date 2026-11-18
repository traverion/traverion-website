/**
 * P9.35 — Controlled fixture certification for reject → unlock → replace → resubmit decisions.
 * Does not invent production company documents, Stripe KYC, or LIVE Connect enablement.
 */
import { describe, expect, it } from 'vitest';
import { isSupplierBusinessIdentityLocked } from './supplierVerificationLocks';
import {
  partnerAccountStatus,
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
} from './partnerVerificationStatus';

const FIXTURE_FEEDBACK =
  'P9.35 fixture: replace marketing material with an official PRH Trade Register extract (controlled test note).';

describe('P9.35 supplier verification recovery', () => {
  it('maps soft-pending feedback to Action required and unlocks identity', () => {
    const review = partnerBusinessReviewState({
      verificationStatus: 'pending',
      submittedAt: '2026-11-18T10:00:00Z',
      draftComplete: true,
      feedback: FIXTURE_FEEDBACK,
    });
    expect(review).toBe('rejected');
    expect(partnerBusinessStatusChip(review).label).toBe('Action required');
    expect(
      isSupplierBusinessIdentityLocked(
        'pending',
        '2026-11-18T10:00:00Z',
        'company',
        FIXTURE_FEEDBACK
      )
    ).toBe(false);
  });

  it('keeps clean pending locked and Under review', () => {
    const review = partnerBusinessReviewState({
      verificationStatus: 'pending',
      submittedAt: '2026-11-18T10:00:00Z',
      draftComplete: true,
      feedback: null,
    });
    expect(review).toBe('pending');
    expect(partnerBusinessStatusChip(review).label).toBe('Under review');
    expect(
      isSupplierBusinessIdentityLocked('pending', '2026-11-18T10:00:00Z', 'company', null)
    ).toBe(true);
  });

  it('walks reject → replace-ready → resubmit-pending → verified without conflating saved vs verified', () => {
    const rejected = partnerBusinessReviewState({
      verificationStatus: 'rejected',
      submittedAt: '2026-11-18T10:00:00Z',
      draftComplete: true,
      feedback: FIXTURE_FEEDBACK,
    });
    expect(rejected).toBe('rejected');
    expect(
      isSupplierBusinessIdentityLocked(
        'rejected',
        '2026-11-18T10:00:00Z',
        'company',
        FIXTURE_FEEDBACK
      )
    ).toBe(false);

    // After resubmit: feedback cleared, pending again → locked under review.
    const resubmitted = partnerBusinessReviewState({
      verificationStatus: 'pending',
      submittedAt: '2026-11-18T12:00:00Z',
      draftComplete: true,
      feedback: null,
    });
    expect(resubmitted).toBe('pending');
    expect(
      isSupplierBusinessIdentityLocked('pending', '2026-11-18T12:00:00Z', 'company', null)
    ).toBe(true);

    const verified = partnerBusinessReviewState({
      verificationStatus: 'verified',
      submittedAt: '2026-11-18T12:00:00Z',
      draftComplete: true,
      feedback: null,
    });
    expect(verified).toBe('verified');
    expect(partnerBusinessStatusChip(verified).label).toBe('Verified');

    const account = partnerAccountStatus({ business: verified, payout: 'incomplete' });
    expect(account.kind).not.toBe('operational');
    expect(account.chipLabel).toBe('Incomplete');
  });
});
