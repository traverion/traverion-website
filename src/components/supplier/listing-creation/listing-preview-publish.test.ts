import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ListingPreviewPublishStage', () => {
  it('uses a wide two-column composition instead of a narrow max-w-xl card', () => {
    const stage = readFileSync(resolve(__dirname, 'ListingPreviewPublishStage.tsx'), 'utf8');
    const form = readFileSync(resolve(__dirname, '../../../pages/supplier/SupplierListingForm.tsx'), 'utf8');
    expect(stage).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,21.5rem)]');
    expect(stage).toContain('lg:sticky');
    expect(stage).toContain('Booking options');
    expect(stage).toContain('tourOptionCardModel');
    expect(stage).toContain('TRAVERION_STANDARD_CANCELLATION_POLICY');
    expect(form).toContain('<ListingPreviewPublishStage');
    expect(form).toMatch(/stepIdx === 5[\s\S]*max-w-\[72rem\]/);
  });
});
