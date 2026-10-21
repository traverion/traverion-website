import { describe, expect, it } from 'vitest';
import {
  aggregateListingRows,
  aggregateMoneyByCurrency,
  bookingLeadTimeDays,
  buildEarningsSeries,
  chartBucketForDay,
  chooseChartGrain,
  leadTimeBucketDays,
  moneyForBooking,
  percentChange,
  previousAnalyticsRange,
  resolveAnalyticsDateRange,
} from './partner-analytics';

describe('partner-analytics', () => {
  it('resolves rolling and calendar ranges', () => {
    const now = new Date('2026-10-21T12:00:00');
    expect(resolveAnalyticsDateRange('7d', null, null, now)).toEqual({
      from: '2026-10-15',
      to: '2026-10-21',
      label: 'Last 7 days',
    });
    expect(resolveAnalyticsDateRange('this_month', null, null, now).from).toBe('2026-10-01');
    expect(resolveAnalyticsDateRange('all', null, null, now)).toEqual({
      from: null,
      to: null,
      label: 'All time',
    });
  });

  it('computes an equal-length previous period', () => {
    expect(previousAnalyticsRange('2026-10-01', '2026-10-10')).toEqual({
      from: '2026-09-21',
      to: '2026-09-30',
    });
  });

  it('uses snapshot remaining minors for money', () => {
    const money = moneyForBooking(
      { id: 'b1', listing_id: 'l1', amount_paid: 100, currency: 'EUR' },
      {
        booking_id: 'b1',
        currency: 'EUR',
        remaining_gross_minor: 10000,
        remaining_commission_minor: 1500,
        remaining_supplier_minor: 8500,
        commission_bps: 1500,
      }
    );
    expect(money).toEqual({ currency: 'EUR', gross: 100, commission: 15, net: 85 });
  });

  it('aggregates by currency without blending', () => {
    const splits = aggregateMoneyByCurrency(
      [
        {
          id: '1',
          listing_id: 'a',
          amount_paid: 100,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
          guests: 2,
        },
        {
          id: '2',
          listing_id: 'a',
          amount_paid: 50,
          currency: 'USD',
          payment_status: 'paid',
          status: 'confirmed',
          guests: 1,
        },
      ],
      {}
    );
    expect(splits).toHaveLength(2);
    expect(splits.find((s) => s.currency === 'EUR')?.net).toBe(100);
    expect(splits.find((s) => s.currency === 'USD')?.net).toBe(50);
  });

  it('builds listing rows with share of net', () => {
    const rows = aggregateListingRows({
      bookings: [
        {
          id: '1',
          listing_id: 'a',
          amount_paid: 80,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
          guests: 2,
        },
        {
          id: '2',
          listing_id: 'b',
          amount_paid: 20,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
          guests: 1,
        },
      ],
      snapshotsByBookingId: {},
      listingsById: {
        a: { id: 'a', title: 'Tour A', family: 'tour' },
        b: { id: 'b', title: 'Stay B', family: 'stay' },
      },
    });
    expect(rows[0].listingId).toBe('a');
    expect(rows[0].shareOfNet).toBeCloseTo(0.8);
    expect(rows[0].productType).toBe('Tour');
  });

  it('classifies lead time and percent change', () => {
    expect(leadTimeBucketDays(0)).toBe('same_day');
    expect(leadTimeBucketDays(5)).toBe('4_7');
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(50, 0)).toBeNull();
    expect(
      bookingLeadTimeDays({
        id: '1',
        listing_id: 'a',
        created_at: '2026-10-01T10:00:00Z',
        booking_date: '2026-10-10',
      })
    ).toBe(9);
  });

  it('chooses chart grain from range and span (all-time adapts to data)', () => {
    expect(chooseChartGrain(7, '7d')).toBe('day');
    expect(chooseChartGrain(90, '90d')).toBe('week');
    expect(chooseChartGrain(200, 'this_year')).toBe('month');
    expect(chooseChartGrain(10, 'all')).toBe('day');
    expect(chooseChartGrain(100, 'all')).toBe('week');
    expect(chooseChartGrain(400, 'all')).toBe('month');
    expect(chartBucketForDay('2026-10-15', 'month').label).toBe('Oct 2026');
    expect(chartBucketForDay('2026-10-15', 'month').label).not.toBe('Oct 26');
  });

  it('builds all-time series by day when bookings span a short window', () => {
    const series = buildEarningsSeries({
      bookings: [
        {
          id: '1',
          listing_id: 'a',
          created_at: '2026-10-10T10:00:00Z',
          amount_paid: 100,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
        },
        {
          id: '2',
          listing_id: 'a',
          created_at: '2026-10-18T10:00:00Z',
          amount_paid: 50,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
        },
        {
          id: '3',
          listing_id: 'a',
          created_at: '2026-10-18T14:00:00Z',
          amount_paid: 25,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
        },
      ],
      snapshotsByBookingId: {},
      basis: 'booking',
      from: null,
      to: null,
      currency: 'EUR',
      rangeKey: 'all',
      fillZeros: false,
    });
    expect(series.length).toBeGreaterThanOrEqual(2);
    expect(series.map((p) => p.key)).toContain('2026-10-10');
    expect(series.map((p) => p.key)).toContain('2026-10-18');
    const oct18 = series.find((p) => p.key === '2026-10-18');
    expect(oct18?.bookings).toBe(2);
    expect(oct18?.net).toBe(75);
  });

  it('reconciles gross − commission = net in listing aggregates', () => {
    const rows = aggregateListingRows({
      bookings: [
        {
          id: '1',
          listing_id: 'a',
          amount_paid: 100,
          currency: 'EUR',
          payment_status: 'paid',
          status: 'confirmed',
          guests: 2,
        },
      ],
      snapshotsByBookingId: {
        '1': {
          booking_id: '1',
          currency: 'EUR',
          remaining_gross_minor: 10000,
          remaining_commission_minor: 1500,
          remaining_supplier_minor: 8500,
          commission_bps: 1500,
        },
      },
      listingsById: { a: { id: 'a', title: 'Tour A', family: 'tour' } },
    });
    expect(rows[0].gross - rows[0].commission).toBeCloseTo(rows[0].net);
  });
});
