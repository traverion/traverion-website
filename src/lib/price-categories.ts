/**
 * Price categories live under a booking OPTION (product variant).
 * They are NOT options themselves — Adult/Child are participant types with quantities.
 */

import type {
  ListingBookingOption,
  ListingPriceCategory,
  ListingPriceCategoryKind,
  ListingPricingMode,
} from '../types/listingExtras';

export const PRICE_CATEGORY_KIND_PRESETS: {
  kind: ListingPriceCategoryKind;
  label: string;
  ageMin: number;
  ageMax: number;
}[] = [
  { kind: 'adult', label: 'Adult', ageMin: 13, ageMax: 99 },
  { kind: 'youth', label: 'Youth', ageMin: 13, ageMax: 17 },
  { kind: 'child', label: 'Child', ageMin: 4, ageMax: 12 },
  { kind: 'infant', label: 'Infant', ageMin: 0, ageMax: 3 },
  { kind: 'senior', label: 'Senior', ageMin: 65, ageMax: 99 },
];

export function newPriceCategoryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPriceCategory(
  partial: Partial<ListingPriceCategory> & Pick<ListingPriceCategory, 'label' | 'kind'>
): ListingPriceCategory {
  const preset = PRICE_CATEGORY_KIND_PRESETS.find((p) => p.kind === partial.kind);
  return {
    id: partial.id?.trim() || newPriceCategoryId(),
    label: partial.label.trim() || preset?.label || 'Participant',
    kind: partial.kind,
    ageMin: partial.ageMin === undefined ? preset?.ageMin ?? null : partial.ageMin,
    ageMax: partial.ageMax === undefined ? preset?.ageMax ?? null : partial.ageMax,
    priceUsd: typeof partial.priceUsd === 'number' && Number.isFinite(partial.priceUsd)
      ? Math.max(0, partial.priceUsd)
      : 0,
    notPermitted: Boolean(partial.notPermitted),
    countsTowardCapacity: partial.countsTowardCapacity !== false,
    requiresAdult: Boolean(partial.requiresAdult),
  };
}

/** Default Adult + Child starter set for age-dependent pricing. */
export function defaultAgeDependentCategories(adultPrice = 0, childPrice = 0): ListingPriceCategory[] {
  return [
    createPriceCategory({
      kind: 'adult',
      label: 'Adult',
      ageMin: 13,
      ageMax: 99,
      priceUsd: adultPrice,
    }),
    createPriceCategory({
      kind: 'child',
      label: 'Child',
      ageMin: 4,
      ageMax: 12,
      priceUsd: childPrice,
      requiresAdult: true,
    }),
  ];
}

export function formatPriceCategoryAgeRange(c: Pick<ListingPriceCategory, 'ageMin' | 'ageMax'>): string {
  const min = c.ageMin;
  const max = c.ageMax;
  if (min == null && max == null) return '';
  if (min != null && max == null) return `Age ${min}+`;
  if (min == null && max != null) return `Up to age ${max}`;
  if (min === max) return `Age ${min}`;
  return `Age ${min}–${max}`;
}

export function activePriceCategories(option: ListingBookingOption): ListingPriceCategory[] {
  if (option.pricingMode !== 'age_dependent') return [];
  return (option.priceCategories ?? []).filter((c) => !c.notPermitted && c.label.trim());
}

export function optionPricingMode(option: ListingBookingOption): ListingPricingMode {
  return option.pricingMode === 'age_dependent' ? 'age_dependent' : 'uniform';
}

/**
 * Catalog / legacy unit price: adult (or first priced) category when age-dependent;
 * otherwise option.priceUsd.
 */
export function optionHeadlineUnitPrice(option: ListingBookingOption): number {
  if (option.isPrivate && option.privatePricing === 'flat_group') {
    const flat = option.privateGroupPriceUsd ?? 0;
    if (flat > 0) return flat;
  }
  if (optionPricingMode(option) === 'age_dependent') {
    const cats = activePriceCategories(option);
    const adult = cats.find((c) => c.kind === 'adult' && c.priceUsd > 0);
    if (adult) return adult.priceUsd;
    const priced = cats.filter((c) => c.priceUsd > 0).sort((a, b) => b.priceUsd - a.priceUsd);
    if (priced[0]) return priced[0].priceUsd;
  }
  return typeof option.priceUsd === 'number' && option.priceUsd > 0 ? option.priceUsd : 0;
}

/** Keep priceUsd in sync for checkout / catalog until mixed-pax quotes ship. */
export function syncOptionHeadlinePrice(option: ListingBookingOption): ListingBookingOption {
  const headline = optionHeadlineUnitPrice(option);
  if (headline > 0 && option.priceUsd !== headline) {
    return { ...option, priceUsd: headline };
  }
  return option;
}

export function priceCategoryValidationMessages(option: ListingBookingOption): string[] {
  const msg: string[] = [];
  if (option.isPrivate && option.privatePricing === 'flat_group') {
    const flat = option.privateGroupPriceUsd ?? 0;
    if (flat <= 0) msg.push('Set a private group price greater than zero.');
    return msg;
  }

  if (optionPricingMode(option) === 'uniform') {
    if (option.priceUsd <= 0) msg.push('Set a price greater than zero.');
    return msg;
  }

  const cats = option.priceCategories ?? [];
  const usable = cats.filter((c) => !c.notPermitted);
  if (usable.length === 0) {
    msg.push('Add at least one age category travelers can book (for example Adult).');
    return msg;
  }
  for (const c of usable) {
    if (!c.label.trim()) msg.push('Every age category needs a label.');
    if (c.priceUsd < 0) msg.push(`“${c.label || 'Category'}” cannot have a negative price.`);
    if (c.ageMin != null && c.ageMax != null && c.ageMin > c.ageMax) {
      msg.push(`“${c.label || 'Category'}” age range is invalid (min above max).`);
    }
  }
  if (!usable.some((c) => c.priceUsd > 0) && !usable.every((c) => c.priceUsd === 0)) {
    msg.push('Set a price for at least one age category (use 0 only when that category is free).');
  }
  if (!usable.some((c) => c.priceUsd > 0) && usable.every((c) => c.priceUsd === 0)) {
    // All free is unusual but allowed for e.g. infants-only add-on — require adult-priced for sellable tours
    msg.push('Set a price greater than zero for at least one age category.');
  }
  return msg;
}

export function summarizeOptionPricing(
  option: ListingBookingOption,
  formatAmount: (n: number) => string
): string {
  if (option.isPrivate && option.privatePricing === 'flat_group') {
    const flat = option.privateGroupPriceUsd ?? option.priceUsd;
    return flat > 0 ? `Private group ${formatAmount(flat)}` : 'Private group — set price';
  }
  if (optionPricingMode(option) === 'age_dependent') {
    const cats = activePriceCategories(option);
    if (cats.length === 0) return 'Age pricing — add categories';
    return cats
      .map((c) => `${c.label.trim()} ${formatAmount(c.priceUsd)}`)
      .join(' · ');
  }
  return option.priceUsd > 0 ? `${formatAmount(option.priceUsd)} per person` : 'Set price';
}
