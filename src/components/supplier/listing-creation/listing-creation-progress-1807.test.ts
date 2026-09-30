import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1807: listing creation progress / sticky footer polish', () => {
  it('elevates sticky footer and scene progress dots', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(css).toContain('Phase 1807');
    expect(css).toContain('listing-creation-scene-progress__dot--current');
    expect(css).toContain('backdrop-filter: blur(10px)');
  });

  it('marks completed scenes and shows mobile progress track', () => {
    const progress = readFileSync(
      resolve(__dirname, 'ListingCreationSceneProgress.tsx'),
      'utf8'
    );
    const mobile = readFileSync(
      resolve(__dirname, 'ListingCreationMobileProgress.tsx'),
      'utf8'
    );
    expect(progress).toContain('complete = i < index');
    expect(progress).toContain("', complete'");
    expect(progress).toContain('Check');
    expect(mobile).toContain('bg-finland');
    expect(mobile).toContain("item.state === 'current'");
  });
});
