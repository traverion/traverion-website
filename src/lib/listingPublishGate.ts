import type { TourPackage } from '../types/tour';
import { LISTING_PLACEHOLDER_IMAGE } from './listingQualityScore';

/**
 * Human-readable blockers before publishing a listing. Keeps the bar reasonable for a first tour.
 */
export function getListingPublishBlockers(listing: TourPackage): string[] {
  const out: string[] = [];
  const title = listing.title?.trim() ?? '';
  if (title.length < 10) {
    out.push('Title is too short — add a clear, specific title (at least 10 characters).');
  }
  const desc = listing.description?.trim() ?? '';
  if (desc.length < 60) {
    out.push('Description is too short — aim for at least a short paragraph (60+ characters) so guests know what they book.');
  }
  const price = listing.price?.startingFrom;
  if (typeof price !== 'number' || price <= 0) {
    out.push('Set a starting price greater than zero.');
  }
  const img = (listing.image ?? '').trim();
  if (!img || img === LISTING_PLACEHOLDER_IMAGE || img.includes('pexels.com/photos/346885')) {
    out.push('Replace the placeholder hero image with a real photo of your experience.');
  }
  const city = listing.city?.trim();
  const country = listing.country?.trim();
  if (!city || !country) {
    out.push('Add both city and country so the listing can be discovered and trusted.');
  }
  const meet = (listing.meetingPoint ?? '').trim().length;
  const pickup = (listing.pickupInstructions ?? '').trim().length;
  if (meet + pickup < 12) {
    out.push('Add meeting point and/or pickup instructions so guests know where to go.');
  }
  return out;
}
