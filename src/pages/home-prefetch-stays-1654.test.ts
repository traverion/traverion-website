import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1654: Home prefetches Stays when stays family selected', () => {
  it('exports prefetchStaysPage and Home wires family-aware prefetch', () => {
    const prefetch = readFileSync(resolve(__dirname, '../lib/routePrefetch.ts'), 'utf8');
    expect(prefetch).toContain('Phase 1654');
    expect(prefetch).toContain('prefetchStaysPage');
    const home = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(home).toContain('prefetchStaysPage');
    expect(home).toMatch(/searchFamily === 'stays' \? prefetchStaysPage\(\)/);
  });
});
