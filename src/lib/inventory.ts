/**
 * Traveler inventory families vs operator listing rows.
 *
 * Families (do not collapse): tour, stay, experience, package.
 * Live for travelers today: tour only.
 *
 * `listings.experience_kind` (tour | ticket | transportation) is the operator format of a tour,
 * not the Experiences category. Do not rename that column.
 *
 * Shared marketplace primitives: listing, booking, availability, money, business, customer.
 * Availability is family-specific: tour departure, stay night, package itinerary, experience slot.
 * The live quote path is tour departure only.
 */

export const INVENTORY_FAMILIES = ['tour', 'stay', 'experience', 'package'] as const;
export type InventoryFamily = (typeof INVENTORY_FAMILIES)[number];

export const LIVE_INVENTORY_FAMILIES = ['tour'] as const;
export type LiveInventoryFamily = (typeof LIVE_INVENTORY_FAMILIES)[number];

export type InventoryAvailabilityUnit =
  | 'tour_departure'
  | 'stay_night'
  | 'package_itinerary'
  | 'experience_slot';

export const INVENTORY_AVAILABILITY_UNIT: Record<InventoryFamily, InventoryAvailabilityUnit> = {
  tour: 'tour_departure',
  stay: 'stay_night',
  package: 'package_itinerary',
  experience: 'experience_slot',
};

export const MARKETPLACE_PRIMITIVES = [
  'listing',
  'booking',
  'availability',
  'money',
  'business',
  'customer',
] as const;

export type InventoryListingSlice = {
  isHolidayPackage?: boolean;
  listingExtras?: unknown;
  /** Operator format only — never used as the public Experiences category. */
  experienceKind?: string | null;
};

export function isInventoryFamily(value: string): value is InventoryFamily {
  return (INVENTORY_FAMILIES as readonly string[]).includes(value);
}

export function isInventoryFamilyLive(family: InventoryFamily): boolean {
  return (LIVE_INVENTORY_FAMILIES as readonly string[]).includes(family);
}

function familyFromExtras(extras: unknown): InventoryFamily | null {
  if (!extras || typeof extras !== 'object') return null;
  const raw = (extras as { inventoryFamily?: unknown }).inventoryFamily;
  return typeof raw === 'string' && isInventoryFamily(raw) ? raw : null;
}

/**
 * Public category for a listing. Seed holiday packages are packages; everything else is a tour
 * unless listing extras explicitly mark stay / experience / package.
 */
export function inventoryFamilyFromListing(listing: InventoryListingSlice): InventoryFamily {
  if (listing.isHolidayPackage) return 'package';
  return familyFromExtras(listing.listingExtras) ?? 'tour';
}

export function availabilityUnitForListing(listing: InventoryListingSlice): InventoryAvailabilityUnit {
  return INVENTORY_AVAILABILITY_UNIT[inventoryFamilyFromListing(listing)];
}

/** Traveler catalog and checkout only for live families (tours). */
export function listingIsOnTravelerCatalog(listing: InventoryListingSlice): boolean {
  return isInventoryFamilyLive(inventoryFamilyFromListing(listing));
}

/** Checkout quotes a tour departure. Other units are not implemented. */
export function listingCanUseTravelerQuote(listing: InventoryListingSlice): boolean {
  return listingIsOnTravelerCatalog(listing) && availabilityUnitForListing(listing) === 'tour_departure';
}

export function filterTravelerCatalog<T extends InventoryListingSlice>(listings: T[]): T[] {
  return listings.filter(listingIsOnTravelerCatalog);
}

export type PartnerCreateInventoryOption = {
  family: InventoryFamily;
  canCreate: boolean;
  title: string;
  description: string;
};

/** Operator create sheet. Experiences/Packages are consumer categories, not listing types here. */
export const PARTNER_CREATE_INVENTORY: PartnerCreateInventoryOption[] = [
  {
    family: 'tour',
    canCreate: true,
    title: 'Tour',
    description: 'A guided day, activity, or departure with a price and meeting point.',
  },
  {
    family: 'stay',
    canCreate: false,
    title: 'Stay',
    description: 'Apartments and rooms are coming. Not available to create yet.',
  },
];

export const RESERVED_PUBLIC_INVENTORY_PATHS: Record<string, Exclude<InventoryFamily, 'tour'>> = {
  '/stays': 'stay',
  '/experiences': 'experience',
};

export function reservedInventoryFamilyFromPath(pathname: string): Exclude<InventoryFamily, 'tour'> | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return RESERVED_PUBLIC_INVENTORY_PATHS[normalized] ?? null;
}

export function publicPathForInventoryFamily(family: InventoryFamily): string {
  if (family === 'tour') return '/packages';
  if (family === 'stay') return '/stays';
  if (family === 'experience') return '/experiences';
  return '/packages';
}

export function reservedInventoryCopy(family: Exclude<InventoryFamily, 'tour'>): { title: string; body: string } {
  if (family === 'stay') {
    return {
      title: 'Stays are not live',
      body: 'Traverion does not sell rooms yet. That is expected — stays will be their own category, not mixed into Tours.',
    };
  }
  if (family === 'package') {
    return {
      title: 'Packages are not live',
      body: 'Multi-day packages are reserved as their own category. Browse tours for what you can book today.',
    };
  }
  return {
    title: 'Experiences is reserved',
    body: 'Experiences will be its own category. It is not folded into Tours. Browse tours for what you can book today.',
  };
}
