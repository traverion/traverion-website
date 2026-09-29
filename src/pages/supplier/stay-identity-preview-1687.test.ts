import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1687: Stay basics show Travelers see identity preview', () => {
  it('mounts ListingCreationIdentityPreview on stay step 0', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListingForm.tsx'), 'utf8');
    expect(src).toContain('Phase 1687');
    expect(src).toContain('ListingCreationIdentityPreview');
    expect(src).toMatch(/isStayForm[\s\S]*ListingCreationIdentityPreview[\s\S]*languageLabel=\{null\}/);
  });
});
