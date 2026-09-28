import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1660: signed-out confirmation has browse escapes', () => {
  it('offers Browse tours and stays under Sign in', () => {
    const src = readFileSync(resolve(__dirname, 'BookingConfirmationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1660');
    expect(src).toContain("Sign in to see your confirmation");
    const signedOut = src.slice(src.indexOf('if (!user?.id)'), src.indexOf('const statusChipLabel'));
    expect(signedOut).toContain('Browse tours');
    expect(signedOut).toContain('Browse stays');
  });
});
