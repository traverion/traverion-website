import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1644: publish gate NoticeCallout stays while editing', () => {
  it('uses NoticeCallout warn and does not clear gate on Edit listing', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('Phase 1644');
    expect(src).toContain('NoticeCallout');
    expect(src).toMatch(/openSupplierListingEditor\(publishGate\.listingId\);\s*\}/);
    expect(src).not.toMatch(
      /openSupplierListingEditor\(publishGate\.listingId\);\s*setPublishGate\(null\)/
    );
  });
});
