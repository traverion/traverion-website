import { describe, expect, it } from 'vitest';
import { stayFormCheckInOutFromExtras } from './stay-form-check-times';

describe('stayFormCheckInOutFromExtras', () => {
  it('Phase 1518: does not invent check-in/out when extras omit them', () => {
    expect(stayFormCheckInOutFromExtras(null)).toEqual({ stayCheckIn: '', stayCheckOut: '' });
    expect(stayFormCheckInOutFromExtras({})).toEqual({ stayCheckIn: '', stayCheckOut: '' });
  });

  it('keeps published times when present', () => {
    expect(
      stayFormCheckInOutFromExtras({ checkInTime: '16:00', checkOutTime: '11:00' })
    ).toEqual({ stayCheckIn: '16:00', stayCheckOut: '11:00' });
  });
});
