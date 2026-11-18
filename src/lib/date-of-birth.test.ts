import { describe, expect, it } from 'vitest';
import {
  ageYearsOn,
  formatIsoDob,
  parseIsoDob,
  validateIsoDob,
} from './date-of-birth';

describe('date-of-birth', () => {
  it('parses and formats ISO dates', () => {
    expect(parseIsoDob('1990-05-15')).toEqual({ year: 1990, month: 5, day: 15 });
    expect(formatIsoDob({ year: 1990, month: 5, day: 15 })).toBe('1990-05-15');
    expect(parseIsoDob('1990-13-01')).toBeNull();
    expect(parseIsoDob('1990-02-31')).toBeNull();
  });

  it('rejects future and underage dates', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(validateIsoDob('2030-01-01', { required: true })).toMatch(/future/i);
    expect(validateIsoDob('2015-11-20', { required: true })).toMatch(/18/);
    expect(validateIsoDob('2000-01-01', { required: true })).toBeNull();
    expect(ageYearsOn({ year: 2000, month: 1, day: 1 }, now)).toBe(26);
  });

  it('requires a value by default', () => {
    expect(validateIsoDob('')).toMatch(/select/i);
    expect(validateIsoDob('', { required: false })).toBeNull();
  });
});
