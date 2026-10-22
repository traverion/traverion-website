import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Home stays personalization copy', () => {
  it('uses Inspired by you eyebrow and premium subtitle when interestPlace is set', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('staysSectionEyebrow');
    expect(src).toContain("interestPlace ? 'Inspired by you' : 'Stays'");
    expect(src).toContain('Places to stay near your recent discoveries.');
    expect(src).not.toContain('Ranked from your recent browsing');
  });
});
