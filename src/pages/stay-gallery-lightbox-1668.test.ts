import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1668: Stay gallery lightbox', () => {
  it('offers View all photos and a focused lightbox dialog', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1668');
    expect(src).toContain('View all photos');
    expect(src).toContain('galleryLightboxOpen');
    expect(src).toContain('useDialogFocus');
    expect(src).toContain('aria-label="Photo gallery"');
  });
});
