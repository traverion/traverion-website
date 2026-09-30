import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1801: Home hero brand hierarchy', () => {
  it('TRAVERION brand scales larger than the hero headline', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('Phase 1801');
    // Brand uses display sizes that outrank the h1.
    expect(src).toMatch(/TRAVERION[\s\S]*?text-5xl sm:text-6xl lg:text-7xl/);
    expect(src).toMatch(/page-hero-title[\s\S]*?text-xl sm:text-2xl/);
    // Headline must not reuse the old competing 3xl/5xl/6xl scale.
    expect(src).not.toMatch(
      /page-hero-title font-display text-3xl sm:text-5xl lg:text-6xl/
    );
  });
});
