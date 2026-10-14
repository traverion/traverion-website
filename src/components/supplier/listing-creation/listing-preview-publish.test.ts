import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ListingPreviewPublishStage', () => {
  it('uses a wide white editorial two-column composition', () => {
    const stage = readFileSync(resolve(__dirname, 'ListingPreviewPublishStage.tsx'), 'utf8');
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(stage).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(16.5rem,20rem)]');
    expect(stage).toContain('lg:sticky');
    expect(stage).toContain('Booking options');
    expect(stage).toContain('Experience highlights');
    expect(stage).toContain('tourOptionCardModel');
    expect(stage).toContain('TRAVERION_STANDARD_CANCELLATION_POLICY');
    expect(stage).toContain('listing-preview-publish__section-num');
    expect(stage).not.toContain('bg-paper');
    expect(form).toContain('<ListingPreviewPublishStage');
    expect(form).toMatch(/stepIdx === 5[\s\S]*max-w-\[72rem\]/);
    expect(css).toContain('--lc-paper: #ffffff');
    expect(css).toContain('--lc-accent: #073b83');
    expect(css).not.toMatch(/\.listing-creation-workspace \{\s*--lc-paper: #f4f0ea/);
  });
});
