import { describe, expect, it } from 'vitest';
import { planStayNightPick } from './stay-night-pick';

describe('planStayNightPick', () => {
  const occupied = new Set<string>(['2099-06-10']);

  it('starts a new range on first click', () => {
    expect(
      planStayNightPick({
        iso: '2099-06-01',
        todayIso: '2099-05-01',
        occupied,
        checkIn: '',
        checkOut: '',
        minNights: 2,
      })
    ).toEqual({ checkIn: '2099-06-01', checkOut: '', close: false });
  });

  it('completes a valid check-out and closes', () => {
    expect(
      planStayNightPick({
        iso: '2099-06-04',
        todayIso: '2099-05-01',
        occupied,
        checkIn: '2099-06-01',
        checkOut: '',
        minNights: 2,
      })
    ).toEqual({ checkIn: '2099-06-01', checkOut: '2099-06-04', close: true });
  });

  it('rejects occupied nights and past dates without mutating', () => {
    expect(
      planStayNightPick({
        iso: '2099-06-10',
        todayIso: '2099-05-01',
        occupied,
        checkIn: '',
        checkOut: '',
        minNights: 1,
      }).reason
    ).toBe('occupied');
    expect(
      planStayNightPick({
        iso: '2099-04-01',
        todayIso: '2099-05-01',
        occupied,
        checkIn: '',
        checkOut: '',
        minNights: 1,
      }).reason
    ).toBe('past');
  });

  it('restarts when selecting an earlier day after check-in', () => {
    expect(
      planStayNightPick({
        iso: '2099-06-02',
        todayIso: '2099-05-01',
        occupied,
        checkIn: '2099-06-05',
        checkOut: '',
        minNights: 1,
      })
    ).toEqual({ checkIn: '2099-06-02', checkOut: '', close: false });
  });

  it('rejects ranges shorter than min nights', () => {
    const next = planStayNightPick({
      iso: '2099-06-02',
      todayIso: '2099-05-01',
      occupied,
      checkIn: '2099-06-01',
      checkOut: '',
      minNights: 3,
    });
    expect(next.close).toBe(false);
    expect(next.reason).toBe('min_nights');
    expect(next.checkOut).toBe('');
  });
});
