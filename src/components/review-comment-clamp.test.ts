import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ReviewCommentClamp + public review surfaces', () => {
  it('clamps with CSS line-clamp-3 and See more / See less', () => {
    const src = readFileSync(resolve(__dirname, 'ReviewCommentClamp.tsx'), 'utf8');
    expect(src).toContain('line-clamp-3');
    expect(src).toContain('See more');
    expect(src).toContain('See less');
    expect(src).toContain('aria-expanded');
    expect(src).toContain('scrollHeight');
  });

  it('Tour, Stay, and reviews modal use ReviewCommentClamp', () => {
    for (const rel of [
      '../pages/TourDetails.tsx',
      '../pages/StayDetails.tsx',
      'ListingReviewsModal.tsx',
    ]) {
      const src = readFileSync(resolve(__dirname, rel), 'utf8');
      expect(src).toContain('ReviewCommentClamp');
    }
  });
});

describe('Supplier reviews compact + email-first notify', () => {
  it('opens reply editor on demand and drops orange needs-reply card chrome', () => {
    const page = readFileSync(resolve(__dirname, '../pages/supplier/SupplierReviews.tsx'), 'utf8');
    expect(page).toContain('startEditingReply');
    expect(page).toContain('View booking');
    expect(page).toContain('ReviewCommentClamp');
    expect(page).not.toContain('tv-reviews-card--needs-reply');
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).not.toContain('.tv-reviews-card--needs-reply');
  });

  it('removes PartnerActivityBell from the partner topbar', () => {
    const layout = readFileSync(resolve(__dirname, 'supplier/SupplierLayout.tsx'), 'utf8');
    expect(layout).not.toContain('PartnerActivityBell');
  });
});
