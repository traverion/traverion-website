/**
 * Legacy listings sometimes stored Adult / Child as separate booking OPTIONS.
 * Traveler + quote surfaces treat that menu as one product option with age categories.
 */

import {
  materializedBookingOptions,
  type ListingBookingOption,
  type ListingPriceCategory,
} from '../types/listingExtras';
import { participantKindFromName, qualifierFromOptionName } from './headline-price';
import { PRICE_CATEGORY_KIND_PRESETS } from './price-categories';

function kindFromLegacyOptionName(name: string): ListingPriceCategory['kind'] {
  const q = qualifierFromOptionName(name);
  if (q === 'infant' || q === 'toddler') return 'infant';
  if (q === 'youth' || q === 'student' || q === 'teen') return 'youth';
  if (q === 'senior') return 'senior';
  if (q === 'child') return 'child';
  if (q === 'adult') return 'adult';
  const pk = participantKindFromName(name);
  if (pk === 'adult') return 'adult';
  if (pk === 'reduced') return 'child';
  return 'participant';
}

function categoryFromLegacyOption(o: ListingBookingOption): ListingPriceCategory {
  const kind = kindFromLegacyOptionName(o.name);
  const preset = PRICE_CATEGORY_KIND_PRESETS.find((p) => p.kind === kind);
  return {
    id: o.id,
    label: o.name.trim() || preset?.label || 'Participant',
    kind,
    ageMin: preset?.ageMin ?? null,
    ageMax: preset?.ageMax ?? null,
    priceUsd: typeof o.priceUsd === 'number' && o.priceUsd >= 0 ? o.priceUsd : 0,
    requiresAdult: kind === 'child' || kind === 'infant' || kind === 'youth',
    countsTowardCapacity: true,
  };
}

function deriveCoalescedOptionName(anchor: ListingBookingOption): string {
  const pickup = (anchor.pickupPlace ?? '').trim();
  if (/hotel\s*pick[\s-]?up/i.test(pickup) || /hotel\s*pick[\s-]?up/i.test(anchor.name)) {
    return 'Hotel pickup';
  }
  if (pickup.length >= 3 && pickup.length <= 56) return pickup;
  const t = (anchor.startTime ?? '').trim();
  if (t) return `Departure ${t}`;
  const dur = (anchor.duration ?? '').trim();
  if (dur) return `${dur} tour`;
  return 'Standard tour';
}

/**
 * True when every priced option is a participant ticket name (Adult + Child/Youth/…)
 * and none already carry structured age categories.
 */
export function isLegacyParticipantTicketMenu(opts: ListingBookingOption[]): boolean {
  if (opts.length < 2) return false;
  if (opts.some((o) => o.pricingMode === 'age_dependent' && (o.priceCategories?.length ?? 0) > 0)) {
    return false;
  }
  const kinds = opts.map((o) => participantKindFromName(o.name));
  if (kinds.some((k) => k === 'other')) return false;
  return kinds.includes('adult') && kinds.includes('reduced');
}

/**
 * Collapse Adult/Child ticket options into one traveler-facing option with age pricing.
 * Preserves the adult option id for inventory / discount scope.
 */
export function coalesceLegacyParticipantTicketOptions(
  opts: ListingBookingOption[]
): ListingBookingOption[] {
  if (!isLegacyParticipantTicketMenu(opts)) return opts;

  const adults = opts.filter((o) => participantKindFromName(o.name) === 'adult');
  const reduced = opts.filter((o) => participantKindFromName(o.name) === 'reduced');
  const anchor = adults.reduce((a, b) => (a.priceUsd >= b.priceUsd ? a : b), adults[0]);
  const ordered = [...adults, ...reduced].sort((a, b) => b.priceUsd - a.priceUsd);
  const priceCategories = ordered.map(categoryFromLegacyOption);
  const minPersons = Math.min(...opts.map((o) => Math.max(1, o.minPersons || 1)));

  const coalesced: ListingBookingOption = {
    ...anchor,
    name: deriveCoalescedOptionName(anchor),
    priceUsd: anchor.priceUsd,
    minPersons,
    maxPersons: Math.max(1, anchor.maxPersons || 8),
    maxSpotsPerSlot: Math.max(1, anchor.maxSpotsPerSlot || anchor.maxPersons || 8),
    pricingMode: 'age_dependent',
    priceCategories,
    optionInfo:
      (anchor.optionInfo ?? '').trim() ||
      'Choose how many adults and children are joining this departure.',
  };

  return [coalesced];
}

/** Traveler + quote path: materialize then coalesce legacy Adult/Child menus. */
export function travelerFacingBookingOptions(
  opts: ListingBookingOption[] | undefined
): ListingBookingOption[] {
  return coalesceLegacyParticipantTicketOptions(materializedBookingOptions(opts));
}
