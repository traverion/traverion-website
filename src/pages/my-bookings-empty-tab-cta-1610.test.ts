import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1610: Trips Past/Cancelled empty links to Upcoming', () => {
  it('offers View upcoming trips when other bookings exist', () => {
    const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1610');
    expect(src).toContain('View upcoming trips');
    expect(src).toMatch(
      /tripView === 'upcoming' \?[\s\S]*Browse tours[\s\S]*: bookings\.length > 0 \?[\s\S]*selectTripView\('upcoming'\)/
    );
  });
});
