import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ListingPreviewPublishStage', () => {
  it('uses adaptive gallery, traveler preview, and compact publishing panel', () => {
    const stage = readFileSync(resolve(__dirname, 'ListingPreviewPublishStage.tsx'), 'utf8');
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(stage).toContain('function PreviewGallery');
    expect(stage).toContain('Traveler preview');
    expect(stage).toContain('lg:sticky');
    expect(stage).toContain('incomplete.map');
    expect(stage).toContain('labelsForCatalogIds');
    expect(stage).toContain('tourOptionCardModel');
    expect(stage).not.toContain('gallerySlots');
    expect(stage).not.toContain('listing-preview-publish__section-num');
    expect(stage).not.toContain('bg-paper');
    expect(stage).not.toMatch(/Configured|Incomplete/);
    expect(form).toContain('<ListingPreviewPublishStage');
    expect(form).toMatch(/\/ person|\/ group/);
    expect(css).toContain('--partner-bg: #f8f9fb');
    expect(css).toContain('--lc-paper: #ffffff');
  });
});
