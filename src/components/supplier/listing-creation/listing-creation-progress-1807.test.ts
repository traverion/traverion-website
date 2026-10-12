import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('listing creation progress polish', () => {
  it('keeps elevated sticky footer and scene progress styles', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(css).toContain('Phase 1807');
    expect(css).toContain('backdrop-filter: blur(10px)');
  });

  it('uses readiness-based labeled scene steps and satisfaction-based mobile bar', () => {
    const progress = readFileSync(resolve(__dirname, 'ListingCreationSceneProgress.tsx'), 'utf8');
    const mobile = readFileSync(resolve(__dirname, 'ListingCreationMobileProgress.tsx'), 'utf8');
    expect(progress).toContain('isComplete');
    expect(progress).toContain("', complete'");
    expect(progress).toContain('Check');
    expect(progress).toContain('short');
    expect(mobile).toContain('bg-finland');
    expect(mobile).toContain("item.state === 'complete'");
  });
});
