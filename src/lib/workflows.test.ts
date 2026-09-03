import { describe, expect, it } from 'vitest';
import { normalizeListingForDraftSave } from './listingDraftUtils';
import {
  bookingBelongsToExperience,
  isListingVisibleToTravelers,
  isSupplierBookingStatus,
  LISTING_WIZARD_PHOTO_STEP,
  LISTING_WIZARD_STEP_COUNT,
  pickupAssignmentComplete,
} from './product-workflows';
import type { TourPackage } from '../types/tour';

describe('normalizeListingForDraftSave', () => {
  it('keeps entered fields and fills only empty required columns', () => {
    const saved = normalizeListingForDraftSave({
      id: 'draft-1',
      title: '  Northern lights chase  ',
      destination: '',
      duration: '',
      style: 'Tour',
      startLocation: 'Rovaniemi',
      endLocation: 'Rovaniemi',
      price: {
        startingFrom: 99,
        currency: 'USD',
        perPerson: true,
        twinOccupancy: false,
        customQuote: false,
        singleSupplement: 0,
        validity: 'Year round',
      },
      category: '3*',
      tourType: 'cultural',
      validity: 'Year round',
      image: 'https://example.com/a.jpg',
      description: 'Guide-led hunt',
      highlights: ['Small group'],
      itinerary: [],
      includes: ['Guide'],
      excludes: ['Meals'],
      hotels: [],
      difficulty: 'Easy',
      groupSize: '1-8',
      bestTime: 'Winter',
      rating: 0,
      reviews: 0,
      isPopular: false,
      status: 'published',
    } as TourPackage);
    expect(saved.status).toBe('draft');
    expect(saved.title).toBe('Northern lights chase');
    expect(saved.destination).toBe('Various locations');
    expect(saved.duration).toBe('To be confirmed');
    expect(saved.description).toBe('Guide-led hunt');
    expect(saved.highlights).toEqual(['Small group']);
  });
});

describe('catalog visibility', () => {
  it('shows published listings and hides drafts', () => {
    expect(isListingVisibleToTravelers('published')).toBe(true);
    expect(isListingVisibleToTravelers(null)).toBe(true);
    expect(isListingVisibleToTravelers('draft')).toBe(false);
  });
});

describe('booking ownership', () => {
  it('binds a paid booking to the correct listing, traveler, and supplier', () => {
    expect(
      bookingBelongsToExperience({
        bookingListingId: 'listing-a',
        listingId: 'listing-a',
        bookingGuestUserId: 'traveler-1',
        expectedGuestUserId: 'traveler-1',
        listingSupplierId: 'op-1',
        expectedSupplierId: 'op-1',
      })
    ).toBe(true);
    expect(
      bookingBelongsToExperience({
        bookingListingId: 'listing-a',
        listingId: 'listing-b',
        bookingGuestUserId: 'traveler-1',
        expectedGuestUserId: 'traveler-1',
      })
    ).toBe(false);
    expect(
      bookingBelongsToExperience({
        bookingListingId: 'listing-a',
        listingId: 'listing-a',
        listingSupplierId: 'op-1',
        expectedSupplierId: 'op-2',
      })
    ).toBe(false);
  });
});

describe('supplier booking status', () => {
  it('only allows pending, confirmed, cancelled', () => {
    expect(isSupplierBookingStatus('confirmed')).toBe(true);
    expect(isSupplierBookingStatus('paid')).toBe(false);
  });
});

describe('pickup assignment', () => {
  it('is complete when pickup is not required or a time is stored', () => {
    expect(pickupAssignmentComplete(null, false)).toBe(true);
    expect(pickupAssignmentComplete(null, true)).toBe(false);
    expect(pickupAssignmentComplete('08:30:00', true)).toBe(true);
  });
});

describe('listing wizard', () => {
  it('uses four steps with photos last', () => {
    expect(LISTING_WIZARD_STEP_COUNT).toBe(4);
    expect(LISTING_WIZARD_PHOTO_STEP).toBe(3);
  });
});
