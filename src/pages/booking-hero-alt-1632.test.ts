import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1632: BookingPage checkout hero alt text', () => {
  it('uses tour.title for both checkout hero images', () => {
    const src = readFileSync(resolve(__dirname, 'BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1632');
    expect(src.match(/alt=\{tour\.title\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/src=\{tour\.image\} alt=""/);
  });
});
