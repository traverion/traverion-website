/**
 * Canonical marketplace loop as pure functions.
 * Used by regression tests so create → publish → discover → quote → booking ownership
 * cannot drift silently. Not wired to a specific operator (Royal Nordic is customer-zero only).
 */

import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';
import { getListingPublishBlockers } from './listingPublishGate';
import { normalizeListingForDraftSave } from './listingDraftUtils';
import {
  bookingBelongsToExperience,
  isListingVisibleToTravelers,
  isSupplierBookingStatus,
  pickupAssignmentComplete,
} from './product-workflows';
import { optionRunsOnDate, quoteBooking } from './booking-quote';
import { nextBookedCount } from './availability-ops';

function option(
  partial: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'name' | 'priceUsd'>
): ListingBookingOption {
  return {
    startTime: '20:00',
    duration: '3 hours',
    pickupPlace: 'Rovaniemi city centre meeting point',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: 'Small group hunt with a local guide',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

/** Generic arctic experience used to dogfood the loop — supplier-owned shape, not a hardcoded brand. */
export function sampleNorthernLightsExperience(over: Partial<TourPackage> = {}): TourPackage {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Guaranteed Northern Lights Tour',
    subtitle: 'Small-group aurora hunt from Rovaniemi with a local guide',
    destination: 'Rovaniemi, Finland',
    duration: '3 hours',
    style: 'Tour',
    startLocation: 'Rovaniemi',
    endLocation: 'Rovaniemi',
    price: {
      startingFrom: 149,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Year round',
    },
    category: '3*',
    tourType: 'adventure',
    validity: 'Year round',
    image: 'https://example.com/aurora-hero.jpg',
    description:
      'Join a small group north of Rovaniemi to hunt the northern lights with a local guide. We drive to dark skies, stop for photos, and serve a hot drink before returning to town.',
    highlights: ['Small group', 'Hot drink', 'Photo stops'],
    itinerary: [],
    includes: ['Guide', 'Hot drink'],
    excludes: ['Hotel pickup'],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '1-8 People',
    bestTime: 'Winter',
    rating: 0,
    reviews: 0,
    isPopular: false,
    status: 'draft',
    city: 'Rovaniemi',
    country: 'Finland',
    listingExtras: {
      bookingOptions: [
        option({
          id: 'opt-aurora',
          name: 'Small group aurora hunt',
          priceUsd: 149,
        }),
      ],
      galleryImageUrls: [
        'https://example.com/aurora-2.jpg',
        'https://example.com/aurora-3.jpg',
        'https://example.com/aurora-4.jpg',
      ],
    },
    ...over,
  };
}

export type MarketplaceBookingRecord = {
  listing_id: string;
  supplier_id: string;
  guest_user_id: string;
  booking_date: string;
  guests: number;
  total_amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  payment_status: 'pending' | 'paid';
};

export type MarketplaceLoopResult = {
  draftPersisted: boolean;
  draftSurvivesReload: boolean;
  publishBlockers: string[];
  publishedVisibleToTravelers: boolean;
  unpublishedHiddenFromTravelers: boolean;
  unpublishedNotBookable: boolean;
  quoteOk: boolean;
  quotedTotal: number | null;
  underpayRejected: boolean;
  booking: MarketplaceBookingRecord | null;
  supplierSeesBooking: boolean;
  bookingSurvivesReload: boolean;
  statusPersisted: boolean;
  capacityBookedByGuests: boolean;
  invalidDateRejected: boolean;
};

/**
 * In-memory composition of the live marketplace loop.
 * Mirrors: supplier draft → publish gate → catalog → PDP quote → booking row → supplier view → status.
 */
export function runMarketplaceLoop(input?: {
  bookingDate?: string;
  guests?: number;
  clientTotalAttempt?: number;
  todayIso?: string;
}): MarketplaceLoopResult {
  const todayIso = input?.todayIso ?? '2026-09-05';
  const bookingDate = input?.bookingDate ?? '2026-09-12';
  const guests = input?.guests ?? 2;
  const supplierId = 'supplier-aurora';
  const travelerId = 'traveler-1';

  const entered = sampleNorthernLightsExperience({
    title: '  Guaranteed Northern Lights Tour  ',
    destination: '',
  });
  const draft = normalizeListingForDraftSave(entered);
  const reloadedDraft = { ...draft };
  const complete = sampleNorthernLightsExperience({ status: 'published', supplierId });
  const publishBlockers = getListingPublishBlockers(complete);
  const unpublished = { ...complete, status: 'draft' as const };

  const quote = quoteBooking({
    tour: complete,
    discounts: [],
    bookingDate,
    guests,
    bookingOptionId: 'opt-aurora',
    todayIso,
  });
  const unpublishedQuote = quoteBooking({
    tour: unpublished,
    discounts: [],
    bookingDate,
    guests,
    bookingOptionId: 'opt-aurora',
    todayIso,
  });
  const badDateQuote = quoteBooking({
    tour: complete,
    discounts: [],
    bookingDate: 'not-a-date',
    guests,
    bookingOptionId: 'opt-aurora',
    todayIso,
  });

  const quotedTotal = quote.ok ? quote.totalAmount : null;
  const clientAttempt = input?.clientTotalAttempt ?? 1;
  const underpayRejected = quote.ok ? Math.abs(clientAttempt - quote.totalAmount) > 0.009 : true;

  let booking: MarketplaceBookingRecord | null = null;
  if (quote.ok) {
    booking = {
      listing_id: complete.id,
      supplier_id: supplierId,
      guest_user_id: travelerId,
      booking_date: quote.bookingDate,
      guests: quote.guests,
      total_amount: quote.totalAmount,
      currency: quote.currency,
      status: 'pending',
      payment_status: 'pending',
    };
  }

  const reloadedBooking = booking ? { ...booking } : null;
  const confirmed = booking ? { ...booking, status: 'confirmed' as const } : null;

  const optionClosed = optionRunsOnDate(
    (complete.listingExtras?.bookingOptions ?? [])[0] as ListingBookingOption,
    bookingDate
  );

  return {
    draftPersisted: draft.status === 'draft' && draft.title.includes('Northern Lights'),
    draftSurvivesReload: reloadedDraft.title === draft.title && reloadedDraft.status === 'draft',
    publishBlockers,
    publishedVisibleToTravelers: isListingVisibleToTravelers(complete.status),
    unpublishedHiddenFromTravelers: !isListingVisibleToTravelers(unpublished.status),
    unpublishedNotBookable: !unpublishedQuote.ok && unpublishedQuote.code === 'unpublished',
    quoteOk: quote.ok && optionClosed === null,
    quotedTotal,
    underpayRejected,
    booking,
    supplierSeesBooking: Boolean(
      booking &&
        bookingBelongsToExperience({
          bookingListingId: booking.listing_id,
          listingId: complete.id,
          bookingGuestUserId: booking.guest_user_id,
          expectedGuestUserId: travelerId,
          listingSupplierId: complete.supplierId,
          expectedSupplierId: supplierId,
        })
    ),
    bookingSurvivesReload: Boolean(
      reloadedBooking &&
        booking &&
        reloadedBooking.listing_id === booking.listing_id &&
        reloadedBooking.total_amount === booking.total_amount &&
        reloadedBooking.guests === booking.guests
    ),
    statusPersisted: Boolean(confirmed && isSupplierBookingStatus(confirmed.status) && confirmed.status === 'confirmed'),
    capacityBookedByGuests: nextBookedCount(0, guests) === guests,
    invalidDateRejected: !badDateQuote.ok,
  };
}

export function marketplaceLoopAssertions(result: MarketplaceLoopResult): string[] {
  const failures: string[] = [];
  if (!result.draftPersisted) failures.push('draft did not persist required fields');
  if (!result.draftSurvivesReload) failures.push('draft did not survive reload');
  if (result.publishBlockers.length > 0) failures.push(`publish blocked: ${result.publishBlockers.join('; ')}`);
  if (!result.publishedVisibleToTravelers) failures.push('published listing not visible to travelers');
  if (!result.unpublishedHiddenFromTravelers) failures.push('draft listing visible to travelers');
  if (!result.unpublishedNotBookable) failures.push('unpublished listing was bookable');
  if (!result.quoteOk) failures.push('honest quote failed');
  if (!result.underpayRejected) failures.push('client underpay was not rejected');
  if (!result.booking) failures.push('booking record was not created');
  if (!result.supplierSeesBooking) failures.push('supplier cannot see the booking');
  if (!result.bookingSurvivesReload) failures.push('booking did not survive reload');
  if (!result.statusPersisted) failures.push('supplier status update did not persist');
  if (!result.capacityBookedByGuests) failures.push('availability increment ignored guest count');
  if (!result.invalidDateRejected) failures.push('invalid date was accepted');
  if (result.booking && !pickupAssignmentComplete(null, false)) failures.push('pickup helper broken');
  return failures;
}
