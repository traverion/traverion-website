/**
 * Rental listing domain — inventoryFamily: 'rental'.
 * Not bookable on the traveler catalog until a dedicated rental checkout mission ships.
 */

export const RENTAL_CATEGORIES = [
  'bikes',
  'winter_clothing',
  'skis_snowboards',
  'snowmobiles',
  'outdoor_equipment',
  'cameras_electronics',
  'clothing_accessories',
  'vehicles',
] as const;

export type RentalCategoryId = (typeof RENTAL_CATEGORIES)[number];

export type RentalDurationMode = 'hourly' | 'daily' | 'both';

/** Unknown stays unset. Not applicable is an explicit supplier choice, not a lack of access. */
export type RentalAccessibilityStatus = 'not_specified' | 'not_applicable' | 'details_provided';

export type RentalDifficulty = 'easy' | 'moderate' | 'challenging' | 'not_applicable';

export type RentalBufferMinutes = 0 | 30 | 60 | 120 | number;

export type RentalWeekday =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

export type RentalOperatingDay = {
  day: RentalWeekday;
  open: boolean;
  earliestPickupHm?: string;
  latestPickupHm?: string;
  earliestReturnHm?: string;
  latestReturnHm?: string;
};

export type RentalPricing = {
  currency?: string;
  pricePerHourMinor?: number | null;
  pricePerDayMinor?: number | null;
  /** Optional multi-day discount percent (0–90). Applied to daily rate for quotes later. */
  multiDayDiscountPercent?: number | null;
  /** Days at or above which multi-day discount applies. */
  multiDayDiscountMinDays?: number | null;
};

export type RentalVariant = {
  /** Stable UUID — never reuse index or display name as identity. */
  id: string;
  name: string;
  description?: string;
  /** Category-specific attributes (size, electric, length, etc.). */
  attributes?: Record<string, string>;
  quantity: number;
  /** When set, overrides listing shared pricing for this variant. */
  pricingOverride?: RentalPricing | null;
  /** Reserved for future per-variant availability overrides. */
  availabilityOverrideNote?: string;
};

export type RentalExtraDraft = {
  id: string;
  name: string;
  /** Stored for future quote support — not charged until checkout engine exists. */
  priceMinor?: number | null;
  optional?: boolean;
};

export type RentalDetails = {
  category?: RentalCategoryId;
  itemType?: string;
  customItemType?: string;
  shortIntro?: string;
  specifications?: Record<string, string>;
  highlights?: string[];
  pickupAddress?: string;
  pickupInstructions?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  returnSameAsPickup?: boolean;
  returnAddress?: string;
  returnInstructions?: string;
  returnLat?: number | null;
  returnLng?: number | null;
  operatingDays?: RentalOperatingDay[];
  /** Pickup handover instructions (method screen). Distinct from pickupInstructions (place). */
  collectionNotes?: string;
  idRequired?: boolean;
  /** Pickup handover method: true = staff, false = self-service. */
  staffAssisted?: boolean;
  /** Return handover method: true = staff, false = self-service. */
  returnStaffAssisted?: boolean;
  /** Return handover instructions (method screen). Distinct from returnInstructions (place). */
  returnCollectionNotes?: string;
  durationMode?: RentalDurationMode;
  minDurationHours?: number | null;
  maxDurationHours?: number | null;
  minDurationDays?: number | null;
  maxDurationDays?: number | null;
  /** Calendar-day rentals use supplier pickup/return hours (default true). */
  calendarDayRentals?: boolean;
  bufferMinutes?: RentalBufferMinutes;
  bookingNoticeHours?: number | null;
  sharedPricing?: RentalPricing;
  variants?: RentalVariant[];
  extras?: RentalExtraDraft[];
  inclusions?: string[];
  requirements?: Record<string, string>;
  /** Pickup-place access. Separate from product difficulty. */
  accessibilityStatus?: RentalAccessibilityStatus;
  accessibilityFeatures?: string[];
  accessibilityNotes?: string;
  /** Omitted when the category does not use difficulty. */
  difficulty?: RentalDifficulty | null;
  /** Extra skill line. Lifted from specifications.skillLevel so it is not also a spec. */
  skillSuitability?: string;
  suitableFor?: string;
  notSuitableFor?: string;
  restrictions?: string[];
  rentalRules?: string;
  cancellationPreset?: string;
  /** Free-text deposit notes (legacy + custom detail). */
  depositDisclosure?: string;
  /** Free-text insurance notes (legacy + custom detail). */
  insuranceDisclosure?: string;
  /** Structured deposit — informational only; Traverion does not collect online. */
  depositRequired?: boolean | null;
  depositAmountMinor?: number | null;
  depositCurrency?: string;
  depositCollectionMethod?: 'cash_at_pickup' | 'card_at_pickup' | 'other' | null;
  depositReturnNotes?: string;
  insuranceIncluded?: boolean | null;
  insuranceCoverageNotes?: string;
  insuranceExclusions?: string;
  insuranceExcessNotes?: string;
  /**
   * Supplier marked the creator checklist complete.
   * Does NOT make the listing publicly bookable — status must stay draft until rental checkout ships.
   */
  creatorComplete?: boolean;
};

export function isRentalCategoryId(value: string): value is RentalCategoryId {
  return (RENTAL_CATEGORIES as readonly string[]).includes(value);
}
