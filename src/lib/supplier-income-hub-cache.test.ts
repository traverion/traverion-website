import { describe, expect, it } from 'vitest';
import {
  clearIncomeHubCache,
  readIncomeHubCache,
  writeIncomeHubCache,
} from './supplier-income-hub-cache';

describe('supplier-income-hub-cache', () => {
  it('round-trips soft cache for a user and clears on demand', () => {
    clearIncomeHubCache();
    expect(readIncomeHubCache('u1')).toBeNull();
    writeIncomeHubCache({
      userId: 'u1',
      earnings: [{ id: 'e1' }],
      paidBookings: [],
      refundDueBookings: [],
      ledger: [],
      commercialTerms: null,
      earningItems: [],
      snapshots: [],
      payoutPeriods: [],
      financialHolds: [],
      listingTitles: { l1: 'Cabin' },
    });
    expect(readIncomeHubCache('u1')?.listingTitles.l1).toBe('Cabin');
    expect(readIncomeHubCache('u2')).toBeNull();
    clearIncomeHubCache('u1');
    expect(readIncomeHubCache('u1')).toBeNull();
  });
});
