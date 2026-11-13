import { describe, expect, it } from 'vitest';
import { supplierDeskOrGroups } from './supabase-bookings';
import { summarizeAnalyticsDaily } from '../lib/partner-analytics';

describe('supplier desk filters', () => {
  it('keeps cancelled and unpaid-null rows, and drops failed checkouts', () => {
    const groups = supplierDeskOrGroups({});
    expect(groups[0]).toContain('payment_status.is.null');
    expect(groups[0]).toContain('payment_status.not.ilike.failed');
    expect(groups.join('\n')).not.toContain('status.not.ilike.cancelled');
  });

  it('applies status before travel, and unpaid ignores the travel window', () => {
    const groups = supplierDeskOrGroups({ ops: 'unpaid', travel: 'today', today: '2026-11-14' });
    const joined = groups.join('\n');
    expect(joined).toContain('payment_status.ilike.pending');
    expect(joined).toContain('status.not.ilike.cancelled');
    expect(joined).not.toContain('booking_date.eq.2026-11-14');
  });

  it('encodes refund due, collected, family, option, and a stable cursor', () => {
    const refund = supplierDeskOrGroups({ ops: 'refund_due' }).join('\n');
    expect(refund).toContain('status.ilike.cancelled');
    expect(refund).toContain('refund_choice.not.ilike.no_refund');
    expect(refund).toContain('dispute_status.not.in.(open,needs_response,under_review,lost)');

    const collected = supplierDeskOrGroups({ ops: 'collected' }).join('\n');
    expect(collected).toContain('amount_paid.gt.0');
    expect(collected).toContain('refund_choice.ilike.no_refund');

    const family = supplierDeskOrGroups({
      family: 'rental',
      rentalListingIds: ['11111111-1111-4111-8111-111111111111'],
    }).join('\n');
    expect(family).toContain('inventoryFamily.eq.rental');

    const option = supplierDeskOrGroups({ optionId: 'opt_1' }).join('\n');
    expect(option).toContain('booking_option_id.eq.opt_1');
    expect(option).toContain('optionId.eq.opt_1');

    const cursor = supplierDeskOrGroups({
      cursor: { createdAt: '2026-11-14T00:00:00.000Z', id: '22222222-2222-4222-8222-222222222222' },
    }).join('\n');
    expect(cursor).toContain('created_at.lt."2026-11-14T00:00:00.000Z"');
    expect(cursor).toContain('id.lt.22222222-2222-4222-8222-222222222222');
  });
});

describe('all time analytics rollup', () => {
  it('uses snapshot minors and legacy amount_paid without blending currencies', () => {
    const summary = summarizeAnalyticsDaily({
      rows: [
        {
          service_day: '2026-01-02',
          created_day: '2026-01-01',
          listing_id: 'listing-a',
          currency: 'EUR',
          booking_currency: 'EUR',
          bucket: 'collected',
          booking_count: 2,
          guest_count: 3,
          gross_minor: 15000,
          commission_minor: 2250,
          supplier_minor: 12750,
          legacy_gross: 0,
          cancel_count: 0,
          supplier_cancel_count: 0,
        },
        {
          service_day: '2026-01-03',
          created_day: '2026-01-01',
          listing_id: 'listing-a',
          currency: 'USD',
          booking_currency: 'USD',
          bucket: 'collected',
          booking_count: 1,
          guest_count: 1,
          gross_minor: 0,
          commission_minor: 0,
          supplier_minor: 0,
          legacy_gross: 40.5,
          cancel_count: 1,
          supplier_cancel_count: 1,
        },
      ],
      listingsById: { 'listing-a': { id: 'listing-a', title: 'Harbor walk', family: 'tour' } },
      basis: 'service',
      productType: 'all',
      listingId: null,
      rangeKey: 'all',
    });
    expect(summary.money.map((row) => [row.currency, row.net, row.bookings])).toEqual([
      ['EUR', 127.5, 2],
      ['USD', 40.5, 1],
    ]);
    expect(summary.cancelStats.cancelled).toBe(1);
    expect(summary.cancelStats.supplierCancelled).toBe(1);
    expect(summary.series.length).toBeGreaterThan(0);
    expect(summary.listingRows[0]?.title).toBe('Harbor walk');
  });
});
