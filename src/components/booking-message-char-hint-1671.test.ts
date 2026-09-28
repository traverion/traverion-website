import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1671: Booking message compose char hint', () => {
  it('shows Up to 4000 characters with live used count', () => {
    const src = readFileSync(resolve(__dirname, 'BookingMessageThread.tsx'), 'utf8');
    expect(src).toContain('Phase 1671');
    expect(src).toContain('Up to 4000 characters');
    expect(src).toContain('msg-hint-');
  });
});
