import { describe, expect, it } from 'vitest';
import { normalizeStayBookingMethod, stayRequestApprovalExpiresAtIso, STAY_REQUEST_APPROVAL_HOURS } from './stay-booking-method';

describe('stay booking method', () => {
  it('defaults unknown values to instant', () => {
    expect(normalizeStayBookingMethod(undefined)).toBe('instant');
    expect(normalizeStayBookingMethod('request')).toBe('request');
    expect(normalizeStayBookingMethod('instant')).toBe('instant');
  });

  it('expires request approvals after 24 hours', () => {
    const from = Date.parse('2026-10-19T12:00:00.000Z');
    expect(stayRequestApprovalExpiresAtIso(from)).toBe('2026-10-20T12:00:00.000Z');
    expect(STAY_REQUEST_APPROVAL_HOURS).toBe(24);
  });
});
