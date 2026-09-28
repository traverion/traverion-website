import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1653: Home mobile search safe-area padding', () => {
  it('pads search sheet actions for the home indicator', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('Phase 1653');
    expect(src).toContain('env(safe-area-inset-bottom)');
    expect(src).toMatch(/home-mobile-search-dialog[\s\S]*safe-area-inset-bottom/);
  });
});
