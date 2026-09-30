import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1820: skeleton shimmer polish', () => {
  it('defines tv-skeleton with reduced-motion fallback', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1820');
    expect(css).toContain('.tv-skeleton');
    expect(css).toContain('tv-skeleton-shimmer');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('Skeleton primitive uses tv-skeleton', () => {
    const src = readFileSync(resolve(__dirname, 'Skeleton.tsx'), 'utf8');
    expect(src).toContain("const base = 'tv-skeleton'");
    expect(src).not.toContain('animate-pulse');
  });
});
