import { describe, expect, it } from 'vitest';
import { tourPaidSlotKey } from '../data/supabase-availability';

describe('tourPaidSlotKey', () => {
  it('normalizes day and HH:MM for slot occupancy maps', () => {
    expect(tourPaidSlotKey('2026-09-15', '9:00')).toBe('2026-09-15|09:00');
    expect(tourPaidSlotKey('2026-09-15', '19:00:00')).toBe('2026-09-15|19:00');
    expect(tourPaidSlotKey('2026-09-15', null)).toBe('2026-09-15|');
  });
});
