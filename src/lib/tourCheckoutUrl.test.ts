import { describe, expect, it } from 'vitest';
import { sanitizeCheckoutReturnPath } from './checkout-paths';
import {
  applyTourCheckoutSearch,
  parseParticipantMixQuery,
  parseTourCheckoutSearch,
  resolveTourCheckoutVariant,
  serializeParticipantMixQuery,
  stripTourCheckoutSearch,
  tourCheckoutCancelPath,
  tourCheckoutPath,
  tourListingPath,
} from './tourCheckoutUrl';

const TOUR_ID = 'c2d25217-84f0-46d4-8eaa-83949143fa06';
const OPTION_ID = 'opt-aurora-1';

const baseState = {
  date: '2026-10-12',
  optionId: OPTION_ID,
  guests: 2,
  mix: null as Record<string, number> | null,
  step: 'review' as const,
  paymentCancelled: false,
};

describe('tour checkout URL', () => {
  it('requires book=1, a calendar date, and an option id', () => {
    expect(parseTourCheckoutSearch(`tour=${TOUR_ID}&date=${baseState.date}&option=${OPTION_ID}`)).toBeNull();
    expect(parseTourCheckoutSearch(`tour=${TOUR_ID}&book=1&option=${OPTION_ID}`)).toBeNull();
    expect(parseTourCheckoutSearch(`tour=${TOUR_ID}&book=1&date=${baseState.date}`)).toBeNull();
    expect(parseTourCheckoutSearch(`tour=${TOUR_ID}&book=1&date=${baseState.date}&option=${OPTION_ID}`)).toEqual({
      ...baseState,
      guests: 1,
      step: 'review',
    });
  });

  it('round-trips path, option, guests, mix, and step', () => {
    const href = tourCheckoutPath(TOUR_ID, {
      ...baseState,
      guests: 3,
      mix: { adult: 2, child: 1 },
      step: 'contact',
    });
    expect(href.startsWith('/packages?')).toBe(true);
    expect(href).toContain(`tour=${TOUR_ID}`);
    expect(href).toContain('book=1');
    expect(href).not.toMatch(/(^|[?&])checkout=/);
    const parsed = parseTourCheckoutSearch(href.slice(href.indexOf('?')));
    expect(parsed).toEqual({
      date: '2026-10-12',
      optionId: OPTION_ID,
      guests: 3,
      mix: { adult: 2, child: 1 },
      step: 'contact',
      paymentCancelled: false,
    });
  });

  it('does not treat stay check-out (`checkout`) as tour checkout', () => {
    expect(
      parseTourCheckoutSearch(`tour=${TOUR_ID}&checkout=2026-10-15&date=2026-10-12&option=${OPTION_ID}`)
    ).toBeNull();
  });

  it('rejects a malformed mix instead of opening a broken checkout', () => {
    expect(
      parseTourCheckoutSearch(`book=1&date=2026-10-12&option=${OPTION_ID}&mix=not-a-mix`)
    ).toBeNull();
  });

  it('strips checkout keys and keeps listing date/guests', () => {
    const params = applyTourCheckoutSearch(
      new URLSearchParams({ tour: TOUR_ID, date: '2026-10-12', guests: '2' }),
      baseState
    );
    const stripped = stripTourCheckoutSearch(params);
    expect(stripped.get('tour')).toBe(TOUR_ID);
    expect(stripped.get('date')).toBe('2026-10-12');
    expect(stripped.get('guests')).toBe('2');
    expect(stripped.get('book')).toBeNull();
    expect(stripped.get('option')).toBeNull();
    expect(stripped.get('step')).toBeNull();
    expect(tourListingPath(TOUR_ID, { date: '2026-10-12', guests: 2 })).toBe(
      `/packages?tour=${TOUR_ID}&date=2026-10-12&guests=2`
    );
  });

  it('builds a same-origin Stripe cancel path that sanitizeCheckoutReturnPath keeps', () => {
    const cancel = tourCheckoutCancelPath(TOUR_ID, { ...baseState, step: 'confirm' });
    expect(cancel).toContain('payment=cancelled');
    expect(cancel).toContain('book=1');
    expect(sanitizeCheckoutReturnPath(cancel, '/bookings?payment=cancelled')).toBe(cancel);
  });

  it('resolves the selected option and the synthetic default', () => {
    const variants = [{ id: OPTION_ID }, { id: 'other' }];
    expect(resolveTourCheckoutVariant(variants, OPTION_ID)?.id).toBe(OPTION_ID);
    expect(resolveTourCheckoutVariant(variants, 'missing')).toBeNull();
    expect(resolveTourCheckoutVariant([{ id: 'solo' }], '__default__')?.id).toBe('solo');
  });

  it('serializes mix without zero quantities', () => {
    expect(serializeParticipantMixQuery({ adult: 2, infant: 0 })).toBe('adult:2');
    expect(parseParticipantMixQuery('adult:2,child:1')).toEqual({ adult: 2, child: 1 });
  });
});
