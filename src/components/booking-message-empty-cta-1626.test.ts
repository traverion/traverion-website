import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1626: messages empty Write first message CTA', () => {
  it('uses tv-btn-secondary with min tap height', () => {
    const src = readFileSync(resolve(__dirname, 'BookingMessageThread.tsx'), 'utf8');
    expect(src).toContain('Phase 1626');
    expect(src).toMatch(/tv-btn-secondary mt-3 min-h-11[\s\S]*Write first message/);
  });
});
