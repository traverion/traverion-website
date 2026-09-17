/**
 * Traveler participant mix under a selected booking OPTION.
 * Age categories are not options — quantities are chosen after the option is selected.
 */

import type { ListingBookingOption, ListingPriceCategory } from '../types/listingExtras';
import { activePriceCategories, optionPricingMode } from './price-categories';

export type ParticipantMixLine = {
  categoryId: string;
  label: string;
  kind: ListingPriceCategory['kind'];
  quantity: number;
  unitPrice: number;
  ageMin: number | null;
  ageMax: number | null;
  requiresAdult: boolean;
  countsTowardCapacity: boolean;
};

export type ParticipantMixSelection = Record<string, number>; // categoryId → qty

export function optionUsesAgePricing(option: ListingBookingOption | null | undefined): boolean {
  if (!option) return false;
  if (option.isPrivate && option.privatePricing === 'flat_group') return false;
  return optionPricingMode(option) === 'age_dependent' && activePriceCategories(option).length > 0;
}

export function optionUsesPrivateFlatPrice(option: ListingBookingOption | null | undefined): boolean {
  return Boolean(option?.isPrivate && option.privatePricing === 'flat_group');
}

export function buildParticipantMixLines(
  option: ListingBookingOption,
  selection: ParticipantMixSelection
): ParticipantMixLine[] {
  return activePriceCategories(option).map((c) => ({
    categoryId: c.id,
    label: c.label.trim() || 'Participant',
    kind: c.kind,
    quantity: Math.max(0, Math.floor(Number(selection[c.id] ?? 0) || 0)),
    unitPrice: c.priceUsd,
    ageMin: c.ageMin,
    ageMax: c.ageMax,
    requiresAdult: Boolean(c.requiresAdult),
    countsTowardCapacity: c.countsTowardCapacity !== false,
  }));
}

export function totalGuestsFromMix(lines: ParticipantMixLine[]): number {
  return lines.reduce((sum, l) => sum + (l.countsTowardCapacity ? l.quantity : 0), 0);
}

export function totalHeadcountFromMix(lines: ParticipantMixLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function mixLineAmount(line: ParticipantMixLine): number {
  return Math.round(line.unitPrice * line.quantity * 100) / 100;
}

export function mixSubtotal(lines: ParticipantMixLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + mixLineAmount(l), 0) * 100) / 100;
}

export function formatMixSummary(lines: ParticipantMixLine[]): string {
  const parts = lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.quantity} ${l.label}${l.quantity === 1 ? '' : l.label.toLowerCase().endsWith('s') ? '' : 's'}`);
  return parts.join(' · ');
}

export function formatMixSummaryCompact(lines: ParticipantMixLine[]): string {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.quantity} ${l.label}`)
    .join(' · ');
}

export function emptyMixSelection(option: ListingBookingOption): ParticipantMixSelection {
  const sel: ParticipantMixSelection = {};
  for (const c of activePriceCategories(option)) {
    sel[c.id] = c.kind === 'adult' ? 1 : 0;
  }
  return sel;
}

export function validateParticipantMix(
  option: ListingBookingOption,
  selection: ParticipantMixSelection
): string | null {
  if (!optionUsesAgePricing(option)) return null;
  const lines = buildParticipantMixLines(option, selection);
  const capacityGuests = totalGuestsFromMix(lines);
  const headcount = totalHeadcountFromMix(lines);
  if (headcount < 1) return 'Add at least one participant.';
  if (capacityGuests < option.minPersons) {
    return option.minPersons === 1
      ? 'At least 1 guest is required.'
      : `At least ${option.minPersons} guests are required for this option.`;
  }
  if (capacityGuests > option.maxPersons) {
    return `No more than ${option.maxPersons} guests allowed for this option.`;
  }
  const adults = lines
    .filter((l) => l.kind === 'adult' || l.kind === 'senior')
    .reduce((s, l) => s + l.quantity, 0);
  for (const line of lines) {
    if (line.quantity > 0 && line.requiresAdult && adults < 1) {
      return `${line.label} must be accompanied by an adult.`;
    }
  }
  if (!lines.some((l) => l.quantity > 0 && l.unitPrice > 0) && mixSubtotal(lines) === 0) {
    // Allow all-free only if at least one free ticket selected (rare); still require headcount
    if (lines.every((l) => l.unitPrice === 0)) return null;
  }
  return null;
}

export type GuestBreakdownRow = {
  categoryId: string;
  label: string;
  kind: string;
  quantity: number;
  unitPrice: number;
};

export function guestBreakdownFromLines(lines: ParticipantMixLine[]): GuestBreakdownRow[] {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      categoryId: l.categoryId,
      label: l.label,
      kind: l.kind,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }));
}

export function parseGuestBreakdown(raw: unknown): GuestBreakdownRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x != null && typeof x === 'object')
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        categoryId: typeof o.categoryId === 'string' ? o.categoryId : '',
        label: typeof o.label === 'string' ? o.label : 'Guest',
        kind: typeof o.kind === 'string' ? o.kind : 'participant',
        quantity: typeof o.quantity === 'number' ? Math.max(0, Math.floor(o.quantity)) : 0,
        unitPrice: typeof o.unitPrice === 'number' && Number.isFinite(o.unitPrice) ? Math.max(0, o.unitPrice) : 0,
      };
    })
    .filter((r) => r.quantity > 0);
}
