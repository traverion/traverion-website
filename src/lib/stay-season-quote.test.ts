import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quoteStayLodging } from './stay-season-quote';

const summer = {
  id: 'summer',
  name: 'Summer',
  start: '2026-04-15',
  end: '2026-08-15',
  enabled: true,
  nightlyPrice: 189,
  minNights: 2,
};
const winter = {
  id: 'winter',
  name: 'Winter',
  start: '2026-11-01',
  end: '2027-03-31',
  enabled: true,
  nightlyPrice: 289,
  minNights: 3,
};

describe('quoteStayLodging', () => {
  it('keeps a flat base rate when no seasons are saved', () => {
    const q = quoteStayLodging({
      checkIn: '2026-06-10',
      nights: 3,
      baseNightly: 189,
      baseMinNights: 1,
      seasons: [],
    });
    expect(q).toEqual({
      ok: true,
      lodging: 567,
      nightlyPrices: [189, 189, 189],
      minNights: 1,
      maxNights: null,
      minGuests: null,
      maxGuests: null,
      cleaningFee: null,
    });
  });

  it('sums each night when a stay crosses two seasons', () => {
    const q = quoteStayLodging({
      checkIn: '2026-08-15',
      nights: 3,
      baseNightly: 100,
      baseMinNights: 1,
      availabilityMode: 'scheduled',
      seasons: [summer, winter, { ...summer, id: 'late', start: '2026-08-16', end: '2026-08-20', nightlyPrice: 210 }],
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.nightlyPrices).toEqual([189, 210, 210]);
    expect(q.lodging).toBe(609);
  });

  it('refuses a night outside a scheduled season and lets an open calendar use the base rate', () => {
    const closed = quoteStayLodging({
      checkIn: '2026-09-01',
      nights: 1,
      baseNightly: 189,
      baseMinNights: 1,
      availabilityMode: 'scheduled',
      seasons: [summer],
    });
    expect(closed.ok).toBe(false);
    const open = quoteStayLodging({
      checkIn: '2026-09-01',
      nights: 1,
      baseNightly: 189,
      baseMinNights: 1,
      availabilityMode: 'open',
      seasons: [summer],
    });
    expect(open).toMatchObject({ ok: true, lodging: 189 });
  });

  it('uses the check-in season minimum stay when it is stricter', () => {
    const q = quoteStayLodging({
      checkIn: '2026-11-02',
      nights: 2,
      baseNightly: 100,
      baseMinNights: 1,
      availabilityMode: 'scheduled',
      seasons: [winter],
    });
    expect(q).toMatchObject({ ok: true, minNights: 3, lodging: 578 });
  });
});

describe('stay season quote copies', () => {
  it('keeps the checkout copy identical to the supplier preview copy', () => {
    const a = readFileSync(resolve(__dirname, 'stay-season-quote.ts'), 'utf8');
    const b = readFileSync(resolve(__dirname, '../../supabase/functions/_shared/stay-season-quote.ts'), 'utf8');
    expect(b).toBe(a);
  });
});
