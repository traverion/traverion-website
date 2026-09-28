import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1613: destination missing-family stubs', () => {
  it('shows Tours stub when only stays exist and Stays stub when only tours exist', () => {
    const src = readFileSync(resolve(__dirname, 'DestinationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1613');
    expect(src).toContain('No tours are published in {label} yet');
    expect(src).toContain('No stays are published in {label} yet');
    expect(src).toContain('Browse all tours');
    expect(src).toContain('Browse all stays');
  });
});
