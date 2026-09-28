import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1622: BookingPage quote-failure Price unavailable', () => {
  it('uses Price unavailable for totalLabel and hero subtitles', () => {
    const src = readFileSync(resolve(__dirname, 'BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1622');
    expect(src).toContain("quoteFailed ? 'Price unavailable' : '—'");
    expect(src).toContain("' · Price unavailable'");
    expect(src).not.toContain("' · —'");
  });
});
