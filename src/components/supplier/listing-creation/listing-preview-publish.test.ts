import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ListingPreviewPublishStage', () => {
  it('uses a height-filling mosaic gallery, lightbox, and selectable options', () => {
    const stage = readFileSync(resolve(__dirname, 'ListingPreviewPublishStage.tsx'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(stage).toContain('listing-preview-gallery');
    expect(stage).toContain('PreviewLightbox');
    expect(stage).toContain('View all photos');
    expect(stage).toContain('role="option"');
    expect(stage).toContain('setSelectedOptionId');
    expect(stage).toContain('Ready to publish');
    expect(stage).toContain('sharedMeeting');
    expect(stage).toContain('listing-preview-publish--mobile-frame');
    expect(stage).not.toContain('gallerySlots');
    expect(stage).not.toContain('All stages look complete');
    expect(css).toContain('.listing-preview-gallery--5');
    expect(css).toContain('grid-template-rows: 1fr 1fr');
    expect(css).toContain('listing-preview-lightbox');
  });
});
