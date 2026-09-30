import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1767: finance role compose skips local Unread clear', () => {
  it('BookingMessageThread skips mark-read when composeBlock is role', () => {
    const src = readFileSync(resolve(__dirname, 'BookingMessageThread.tsx'), 'utf8');
    expect(src).toContain('Phase 1767');
    expect(src).toContain("composeBlock === 'role'");
    expect(src).toContain('do not clear Unread locally');
    expect(src).toMatch(/composeBlock === 'role'[\s\S]*?return;[\s\S]*?markBookingMessagesRead/);
  });
});
