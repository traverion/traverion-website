import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1802: Home discovery CTA + destination tile polish', () => {
  it('defines tv-section-cta and richer dest-tile hover', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1802');
    expect(css).toContain('.tv-section-cta');
    expect(css).toContain('.tv-dest-tile:hover');
  });

  it('Home All tours/stays use tv-section-cta', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('tv-section-cta');
    expect(src).toMatch(/All tours[\s\S]*?tv-section-cta|tv-section-cta[\s\S]*?All tours/);
    expect(src).toMatch(/All stays[\s\S]*?tv-section-cta|tv-section-cta[\s\S]*?All stays/);
  });
});
