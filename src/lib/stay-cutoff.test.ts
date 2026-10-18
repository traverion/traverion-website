import { describe, expect, it } from 'vitest';
import { stayCutoffFromMinutes, stayCutoffToMinutes } from './stay-cutoff';

describe('stay booking cutoff', () => {
  it('stores minutes, hours, and days in the checkout minute field', () => {
    expect(stayCutoffToMinutes('minutes', 5)).toBe(5);
    expect(stayCutoffToMinutes('hours', 5)).toBe(300);
    expect(stayCutoffToMinutes('days', 2)).toBe(2880);
  });

  it('does not read an hour amount as minutes when the unit changes', () => {
    expect(stayCutoffFromMinutes(300)).toEqual({ unit: 'hours', amount: 5 });
    expect(stayCutoffFromMinutes(2880)).toEqual({ unit: 'days', amount: 2 });
    expect(stayCutoffFromMinutes(15)).toEqual({ unit: 'minutes', amount: 15 });
  });
});
