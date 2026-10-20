import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('BookingMessageThread load stability', () => {
  it('keeps load() free of onMarkedRead identity thrash and surfaces load errors', () => {
    const src = readFileSync(resolve(__dirname, 'BookingMessageThread.tsx'), 'utf8');
    expect(src).toContain('onMarkedReadRef');
    expect(src).toContain('hasUnreadInbound');
    expect(src).toMatch(/load\s*=\s*useCallback\([\s\S]*?\[bookingId\]/);
    expect(src).toContain('We could not load messages');
    expect(src).toContain('Try again');
    expect(src).toContain('Loading messages…');
    expect(src).not.toMatch(/\}, \[bookingId, composeBlock, onMarkedRead, viewerRole\]\)/);
  });
});
