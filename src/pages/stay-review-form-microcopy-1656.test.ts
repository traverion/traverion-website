import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1656: Stay review form eligibility and Tap to rate', () => {
  it('explains eligibility and tap-to-rate before stars', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1656');
    expect(src).toContain('Reviews are for guests who completed this paid stay.');
    expect(src).toContain('Tap to rate');
  });
});
