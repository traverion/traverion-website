import { describe, expect, it } from 'vitest';
import { freezeStayBookingPrice, priceStayAddOns, readStayBookingPrice, stayChargeLines, type StayPaidExtra } from './stay-price';
import { quoteStayNights } from './booking-quote';

const sauna: StayPaidExtra = {
  id: 'sauna',
  name: 'Outdoor sauna',
  description: '',
  price: 25,
  charge: 'per_stay',
  mandatory: false,
  maxQuantity: 1,
};

const firewood: StayPaidExtra = {
  id: 'wood',
  name: 'Firewood',
  description: '',
  price: 10,
  charge: 'per_night',
  mandatory: true,
  maxQuantity: 2,
};

describe('stay add-on pricing', () => {
  it('charges mandatory extras and ignores unselected optional extras', () => {
    const priced = priceStayAddOns({
      lodging: 300,
      nights: 3,
      countedGuests: 2,
      extras: [sauna, firewood],
      selected: [],
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.extraLines.map((line) => line.name)).toEqual(['Firewood']);
    expect(priced.extraLines[0]?.amount).toBe(30);
  });

  it('does not let a client price replace the saved extra', () => {
    const priced = priceStayAddOns({
      lodging: 200,
      nights: 2,
      countedGuests: 2,
      extras: [sauna],
      selected: [{ id: 'sauna', quantity: 1 }],
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.extraLines[0]?.amount).toBe(25);
  });

  it('records a request-only extra without adding it to the paid total', () => {
    const priced = priceStayAddOns({
      lodging: 200,
      nights: 2,
      countedGuests: 2,
      extras: [{ ...sauna, requestOnly: true, price: 80 }],
      selected: [{ id: 'sauna', quantity: 1 }],
    });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.extraLines).toEqual([]);
    expect(priced.requests.map((row) => row.name)).toEqual(['Outdoor sauna']);
    expect(priced.requests[0]?.amount).toBe(0);
    const lines = stayChargeLines({ nights: 2, nightlyPrice: 100, cleaningFee: 0, extraLines: priced.extraLines });
    const frozen = freezeStayBookingPrice({ lines, total: 200, requests: priced.requests });
    expect(frozen?.total).toBe(200);
    expect(frozen?.requests[0]?.name).toBe('Outdoor sauna');
    expect(readStayBookingPrice({ stayPrice: { ...frozen, total: 199 } })).toBeNull();
  });

  it('rejects an extra that is not on the schedule', () => {
    const priced = priceStayAddOns({
      lodging: 200,
      nights: 2,
      countedGuests: 2,
      extras: [],
      selected: [{ id: 'sauna', quantity: 1 }],
    });
    expect(priced.ok).toBe(false);
  });

  it('charges extra guests after the included count and applies one long-stay discount', () => {
    const week = priceStayAddOns({
      lodging: 700,
      nights: 7,
      countedGuests: 4,
      includedGuests: 2,
      extraGuestNightly: 20,
      weeklyDiscountPercent: 10,
      monthlyDiscountPercent: 20,
    });
    expect(week.ok).toBe(true);
    if (!week.ok) return;
    expect(week.extraGuestCount).toBe(2);
    expect(week.extraGuestFee).toBe(280);
    expect(week.discount).toBe(70);
    expect(week.discountLabel).toContain('Weekly');

    const month = priceStayAddOns({
      lodging: 2800,
      nights: 28,
      countedGuests: 2,
      weeklyDiscountPercent: 10,
      monthlyDiscountPercent: 20,
    });
    expect(month.ok).toBe(true);
    if (!month.ok) return;
    expect(month.discount).toBe(560);
    expect(month.discountLabel).toContain('Monthly');
    expect(month.discountLabel).not.toContain('Weekly');
  });

  it('keeps the quote total on the server-priced extra', () => {
    const quote = quoteStayNights({
      tour: {
        id: 'stay-1',
        title: 'Cabin',
        status: 'published',
        price: { startingFrom: 100, currency: 'EUR' },
        listingExtras: {
          inventoryFamily: 'stay',
          stay: {
            nightlyPriceUsd: 100,
            maxGuests: 4,
            minNights: 1,
            cleaningFeeUsd: 40,
            availabilityMode: 'scheduled',
            seasons: [
              {
                id: 'summer',
                name: 'Summer',
                start: '2026-06-01',
                end: '2026-08-31',
                enabled: true,
                nightlyPrice: 100,
                minNights: 1,
                extras: [sauna, firewood],
                includedGuests: 2,
                extraGuestNightly: 15,
              },
            ],
          },
        },
      } as never,
      checkIn: '2026-07-01',
      checkOut: '2026-07-04',
      guests: 1,
      party: { adults: 3, children: 0, infants: 0 },
      selectedExtras: [{ id: 'sauna', quantity: 1 }, { id: 'not-real', quantity: 1 }],
      todayIso: '2026-06-01',
      nowMs: Date.parse('2026-06-01T12:00:00Z'),
    });
    expect(quote.ok).toBe(false);

    const accepted = quoteStayNights({
      tour: {
        id: 'stay-1',
        title: 'Cabin',
        status: 'published',
        price: { startingFrom: 100, currency: 'EUR' },
        listingExtras: {
          inventoryFamily: 'stay',
          stay: {
            nightlyPriceUsd: 100,
            maxGuests: 4,
            minNights: 1,
            cleaningFeeUsd: 40,
            availabilityMode: 'scheduled',
            seasons: [
              {
                id: 'summer',
                name: 'Summer',
                start: '2026-06-01',
                end: '2026-08-31',
                enabled: true,
                nightlyPrice: 100,
                minNights: 1,
                extras: [sauna, firewood],
                includedGuests: 2,
                extraGuestNightly: 15,
              },
            ],
          },
        },
      } as never,
      checkIn: '2026-07-01',
      checkOut: '2026-07-04',
      guests: 1,
      party: { adults: 3, children: 0, infants: 0 },
      selectedExtras: [{ id: 'sauna', quantity: 1 }],
      todayIso: '2026-06-01',
      nowMs: Date.parse('2026-06-01T12:00:00Z'),
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    // 3×100 lodging + 1 extra guest × 15 × 3 nights + 40 cleaning + 25 sauna + 30 firewood
    expect(accepted.totalAmount).toBe(440);
    expect(accepted.guests).toBe(3);
    const lines = stayChargeLines({
      nights: accepted.nights,
      nightlyPrice: accepted.nightlyPrice,
      nightlyPrices: accepted.nightlyPrices,
      cleaningFee: accepted.cleaningFee,
      extraGuestCount: accepted.extraGuestCount,
      extraGuestFee: accepted.extraGuestFee,
      discount: accepted.discount,
      discountLabel: accepted.discountLabel,
      extraLines: accepted.extraLines,
    });
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(440);
  });
});
