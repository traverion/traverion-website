/**
 * Partner listings hub: publication label vs content warnings.
 * status stays draft|published for bookability; offline reason lives on listing extras.
 */

import { normalizeRentalDetails } from './rental-details';
import { normalizeStayOptions } from './stay-options';
import { parseListingExtras, type ListingExtras } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';

export type PartnerListingSupplierVisibility = 'paused' | 'deactivated';

export type PartnerListingPublicationLabel = 'Live' | 'Draft' | 'Paused' | 'Deactivated';

export function readListingSupplierVisibility(
  listing: { status?: string | null; listingExtras?: unknown }
): PartnerListingSupplierVisibility | null {
  if ((listing.status ?? '').trim().toLowerCase() !== 'draft') return null;
  const raw = parseListingExtras(listing.listingExtras).supplierVisibility;
  return raw === 'paused' || raw === 'deactivated' ? raw : null;
}

export function partnerListingPublicationLabel(
  listing: { status?: string | null; listingExtras?: unknown }
): PartnerListingPublicationLabel {
  const status = (listing.status ?? '').trim().toLowerCase();
  if (status !== 'draft') return 'Live';
  const visibility = readListingSupplierVisibility(listing);
  if (visibility === 'paused') return 'Paused';
  if (visibility === 'deactivated') return 'Deactivated';
  return 'Draft';
}

export function withListingSupplierVisibility(
  extras: ListingExtras | undefined,
  visibility: PartnerListingSupplierVisibility | null
): ListingExtras {
  const next: ListingExtras = { ...(extras ?? {}) };
  if (visibility === 'paused' || visibility === 'deactivated') {
    next.supplierVisibility = visibility;
  } else {
    delete next.supplierVisibility;
  }
  return next;
}

/** Listing-level + option/variant internal references for search/display. */
export function partnerListingInternalReferences(
  listing: Pick<TourPackage, 'listingExtras'> | { listingExtras?: unknown }
): string[] {
  const extras = parseListingExtras(listing.listingExtras);
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const t = (value ?? '').trim();
    if (t) out.push(t);
  };
  push(extras.internalReference);
  for (const option of extras.bookingOptions ?? []) {
    push(option.internalReference);
  }
  for (const option of normalizeStayOptions(extras.stay?.options)) {
    push(option.internalReference);
  }
  const rental = normalizeRentalDetails(extras.rental);
  for (const variant of rental?.variants ?? []) {
    push(variant.internalReference);
  }
  return out;
}

export function formatListingRatingLabel(rating: number, count: number): string {
  const avg = Number.isFinite(rating) ? Math.max(0, rating) : 0;
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `★ ${avg.toFixed(1)} (${n})`;
}
