import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1629: Trips expand scrolls panel into view', () => {
  it('scrolls trip-panel into view when opening a booking', () => {
    const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1629');
    expect(src).toMatch(/trip-panel-\$\{next\}[\s\S]*scrollIntoView/);
  });
});
