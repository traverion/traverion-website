import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: Trips page exposes a named main region and wires Upcoming/Past/Cancelled tabs
 * to a tabpanel (MarketplaceBrowseShell / DestinationPage catalog landmark parity).
 */
describe('MyBookings Trips landmarks', () => {
  it('labels the trips content region from the page h1', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MyBookings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/id=\{TRIPS_HEADING_ID\}/);
    expect(src).toMatch(/<section aria-labelledby=\{TRIPS_HEADING_ID\}>/);
  });

  it('connects trip status tabs to the list tabpanel', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MyBookings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/aria-controls=\{TRIPS_TABPANEL_ID\}/);
    expect(src).toMatch(/id=\{TRIPS_TABPANEL_ID\}/);
    expect(src).toMatch(/role="tabpanel"/);
    expect(src).toMatch(/aria-labelledby=\{tripsTabId\(tripView\)\}/);
  });
});
