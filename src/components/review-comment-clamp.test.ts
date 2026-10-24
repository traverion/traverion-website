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

  it('Tour and Stay use PublicReviewCard; modal and card use ReviewCommentClamp', () => {
    expect(readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8')).toContain(
      'PublicReviewCard'
    );
    expect(readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8')).toContain(
      'PublicReviewCard'
    );
    expect(readFileSync(resolve(__dirname, 'PublicReviewCard.tsx'), 'utf8')).toContain(
      'ReviewCommentClamp'
    );
    expect(readFileSync(resolve(__dirname, 'ListingReviewsModal.tsx'), 'utf8')).toContain(
      'ReviewCommentClamp'
    );
  });

  it('modal uses PartnerSelect instead of native sort select', () => {
    const modal = readFileSync(resolve(__dirname, 'ListingReviewsModal.tsx'), 'utf8');
    expect(modal).toContain('PartnerSelect');
    expect(modal).toContain('tv-reviews-modal-panel');
    expect(modal).not.toMatch(/<select[\s\S]*Sort reviews/);
  });

  it('StarRatingDisplay supports partial averages with Traverion gold class', () => {
    const stars = readFileSync(resolve(__dirname, 'StarRatingDisplay.tsx'), 'utf8');
    expect(stars).toContain('tv-star-rating');
    expect(stars).toContain('tv-star-rating__partial');
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('--tv-star-gold');
    expect(css).toContain('.tv-star-rating__star--filled');
  });
});


describe('Supplier reviews compact + email-first notify', () => {
  it('keeps Reply / Details on-demand and a compact overview strip', () => {
    const page = readFileSync(resolve(__dirname, '../pages/supplier/SupplierReviews.tsx'), 'utf8');
    expect(page).toContain('startEditingReply');
    expect(page).toContain('toggleDetails');
    expect(page).toContain('Hide details');
    expect(page).toContain('tv-reviews-details');
    expect(page).toContain('tv-reviews-overview');
    expect(page).toContain('tv-reviews-avatar');
    expect(page).toContain('ReviewCommentClamp');
    expect(page).toContain('View booking');
    expect(page).toMatch(/detailsOpen[\s\S]*booking_reference/);
    expect(page).not.toContain('tv-reviews-card--needs-reply');
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('.tv-reviews-details');
    expect(css).toContain('.tv-reviews-overview');
    expect(css).toContain('.tv-public-review-card');
    expect(css).not.toContain('.tv-reviews-card--needs-reply');
  });

  it('Tour review grid uses items-start and shared PublicReviewCard', () => {
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    expect(tour).toContain('items-start');
    expect(tour).toContain('sm:grid-cols-2');
    expect(tour).toContain('PublicReviewCard');
  });


  it('removes PartnerActivityBell from the partner topbar', () => {
    const layout = readFileSync(resolve(__dirname, 'supplier/SupplierLayout.tsx'), 'utf8');
    expect(layout).not.toContain('PartnerActivityBell');
  });
});
