import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1680: Home stays For you matches tours personalization', () => {
  it('uses For you eyebrow and recent-browsing subtitle when interestPlace is set', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('Phase 1680');
    expect(src).toContain('staysSectionEyebrow');
    expect(src).toContain("interestPlace ? 'For you' : 'Stays'");
    expect(src).toContain('Ranked from your recent browsing on this device — still only published stays.');
  });
});
