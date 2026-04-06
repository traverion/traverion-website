import type { TourPackage } from '../types/tour';
import { LISTING_PLACEHOLDER_IMAGE, MIN_LISTING_DESCRIPTION_LENGTH } from './listingQualityScore';

/**
 * Human-readable blockers before publishing a listing. Keeps the bar reasonable for a first tour.
 */
export function getListingPublishBlockers(listing: TourPackage): string[] {
  const out: string[] = [];
  const title = listing.title?.trim() ?? '';
  if (title.length < 10) {
    out.push('Title is too short — add a clear, specific title (at least 10 characters).');
  }
  const sub = listing.subtitle?.trim() ?? '';
  if (sub.length === 0) {
    out.push('Add a subtitle (short line under the title) so guests quickly understand the offer.');
  } else if (sub.length > 300) {
    out.push('Subtitle must be 300 characters or fewer.');
  }
  const desc = listing.description?.trim() ?? '';
  if (desc.length < MIN_LISTING_DESCRIPTION_LENGTH) {
    out.push(
      `Description is too short — use at least ${MIN_LISTING_DESCRIPTION_LENGTH} characters so guests know what they book.`
    );
  }
  if (desc.length > 2000) {
    out.push('Main description must be 2000 characters or fewer.');
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
  const groupSize = (listing.groupSize ?? '').trim();
  if (groupSize.length < 3) {
    out.push('Set group size (for example min–max guests or “up to X”) so guests know what to expect.');
  }
  const meet = (listing.meetingPoint ?? '').trim().length;
  const pickup = (listing.pickupInstructions ?? '').trim().length;
  if (meet + pickup < 12) {
    out.push('Add meeting point and/or pickup instructions so guests know where to go.');
  }
  const inc = (listing.includes ?? []).map((s) => String(s).trim()).filter(Boolean);
  const exc = (listing.excludes ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (inc.length < 2) {
    out.push('Add at least two “what’s included” items so the offer is clear.');
  }
  if (exc.length < 1) {
    out.push('Add at least one “not included” item (for example meals or tickets) to set expectations.');
  }
  const gallery = (listing.listingExtras?.galleryImageUrls ?? []).map((u) => String(u).trim()).filter(Boolean);
  if (gallery.length === 0) {
    out.push('Add at least one extra gallery image URL so travelers see more than a single photo.');
  }
  return out;
}
