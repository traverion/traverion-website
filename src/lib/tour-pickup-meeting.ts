import type { ListingBookingOption } from '../types/listingExtras';
import { materializedBookingOptions, resolveOptionTravelerStartInstructions } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';

export type TourPickupMeetingDisplay = {
  visible: boolean;
  /** How this start works for the traveler. */
  modeIntro: string | null;
  /** Label above the place line when a concrete place is shown. */
  placeLabel: string | null;
  place: string | null;
  instructions: string | null;
  /** True when copy comes from the selected bookable option. */
  optionScoped: boolean;
  optionName: string | null;
  /** Shown when options exist but none is selected yet. */
  multiOptionHint: string | null;
};

type TourPickupSource = Pick<
  TourPackage,
  'meetingPoint' | 'pickupInstructions' | 'experienceStartStyle' | 'listingExtras'
>;

function listingModeIntro(style: TourPackage['experienceStartStyle']): string | null {
  if (style === 'operator_pickup') {
    return 'The operator picks you up. Pickup details appear on your booking in Trips after you pay.';
  }
  if (style === 'fixed_meeting_place') {
    return 'Meet at the place given below. Arrive a few minutes early.';
  }
  if (style === 'either_available') {
    return 'Pickup or meeting point — the option you choose decides which applies.';
  }
  return null;
}

function optionModeIntro(fulfillment: ListingBookingOption['fulfillment']): string | null {
  if (fulfillment === 'pickup') {
    return 'This option includes pickup. Exact pickup timing appears on your booking in Trips after you pay.';
  }
  if (fulfillment === 'meeting_point') {
    return 'This option starts at a meeting point. Arrive a few minutes early.';
  }
  return null;
}

function placeLabelFor(fulfillment: ListingBookingOption['fulfillment'] | undefined): string | null {
  if (fulfillment === 'pickup') return 'Pickup area';
  if (fulfillment === 'meeting_point') return 'Meeting point';
  return null;
}

/** Prefix for option cards / meta lines — never invents pickup from a bare place string. */
export function optionFulfillmentPlaceMeta(
  fulfillment: ListingBookingOption['fulfillment'] | undefined,
  pickupPlace: string
): string | null {
  const place = pickupPlace.trim();
  if (!place) return null;
  if (fulfillment === 'pickup') return `Pickup · ${place}`;
  if (fulfillment === 'meeting_point') return `Meet · ${place}`;
  return place;
}

/**
 * Traveler “Pickup and meeting” truth for the PDP.
 * Selected option wins over listing-denormalized first-option copy.
 */
export function resolveTourPickupMeetingDisplay(
  tour: TourPickupSource,
  selectedOption?: ListingBookingOption | null
): TourPickupMeetingDisplay {
  const options = materializedBookingOptions(tour.listingExtras?.bookingOptions);
  const listingPlace = (tour.meetingPoint ?? '').trim() || null;
  const listingInstructions = (tour.pickupInstructions ?? '').trim() || null;
  const listingIntro = listingModeIntro(tour.experienceStartStyle);

  if (selectedOption) {
    const place = selectedOption.pickupPlace.trim() || listingPlace;
    const instructions =
      resolveOptionTravelerStartInstructions(selectedOption) || listingInstructions;
    const modeIntro = optionModeIntro(selectedOption.fulfillment) ?? listingIntro;
    const labeled = placeLabelFor(selectedOption.fulfillment);
    return {
      visible: Boolean(modeIntro || place || instructions),
      modeIntro,
      placeLabel: place ? labeled ?? 'Location' : null,
      place,
      instructions,
      optionScoped: true,
      optionName: selectedOption.name.trim() || null,
      multiOptionHint: null,
    };
  }

  const distinctPlaces = [
    ...new Set(options.map((o) => o.pickupPlace.trim()).filter((p) => p.length > 0)),
  ];
  const distinctFulfillment = [
    ...new Set(options.map((o) => o.fulfillment).filter((f): f is NonNullable<typeof f> => Boolean(f))),
  ];
  const multi =
    options.length > 1 && (distinctPlaces.length > 1 || distinctFulfillment.length > 1);

  return {
    visible: Boolean(listingIntro || listingPlace || listingInstructions || multi),
    modeIntro: listingIntro,
    placeLabel: listingPlace ? 'Meeting point' : null,
    place: listingPlace,
    instructions: listingInstructions,
    optionScoped: false,
    optionName: null,
    multiOptionHint: multi
      ? 'Pickup and meeting details depend on the option you choose — select an option above to see the exact place.'
      : null,
  };
}
