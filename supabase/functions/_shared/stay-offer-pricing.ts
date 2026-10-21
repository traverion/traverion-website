/**
 * Mirror of src/lib/stay-offer-pricing.ts — keep identical.
 * Apply listing Offers to stay nights without stacking onto weekly/monthly length discounts.
 */

export type StayOfferPriceRow = {
  id?: string | null;
  type: string;
  value: number;
  valid_from?: string | null;
  valid_until?: string | null;
  booking_option_id?: string | null;
  book_from?: string | null;
  book_until?: string | null;
  activity_from?: string | null;
  activity_until?: string | null;
  paused?: boolean | null;
  deleted_at?: string | null;
  booking_limit?: number | null;
  redeemed_count?: number | null;
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function civilDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function civilDayInRange(day: string, from: string | null, until: string | null): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  if (from && day < from) return false;
  if (until && day > until) return false;
  return true;
}

function discountPeriod(row: StayOfferPriceRow): { from: string | null; until: string | null } {
  const activityFrom = civilDay(row.activity_from);
  if (activityFrom) return { from: activityFrom, until: civilDay(row.activity_until) };
  return {
    from: civilDay(row.valid_from) ?? civilDay(row.book_from),
    until: civilDay(row.valid_until) ?? civilDay(row.book_until),
  };
}

function offerApplies(row: StayOfferPriceRow, activityDay: string): boolean {
  if (row.paused) return false;
  if (row.deleted_at) return false;
  if ((row.booking_option_id ?? '').trim()) return false;
  const limit = row.booking_limit;
  if (limit != null && limit > 0 && (row.redeemed_count ?? 0) >= limit) return false;
  const period = discountPeriod(row);
  return civilDayInRange(activityDay, period.from, period.until);
}

function applyOfferUnit(base: number, row: StayOfferPriceRow): number {
  if (row.type === 'percent') return money(base * (1 - Number(row.value) / 100));
  return money(Math.max(0, base - Number(row.value)));
}

export function resolveStayLodgingWithOffers(input: {
  nightDates: string[];
  baseNightlyPrices: number[];
  lengthOfStayDiscount: number;
  lengthOfStayLabel: string | null;
  discounts: readonly StayOfferPriceRow[];
}): {
  nightlyPrices: number[];
  lodging: number;
  discount: number;
  discountLabel: string | null;
  appliedDiscountId: string | null;
} {
  const nights = input.nightDates;
  const bases = input.baseNightlyPrices;
  const baseLodging = money(bases.reduce((sum, n) => sum + n, 0));
  const lengthDiscount = money(Math.max(0, Math.min(input.lengthOfStayDiscount, baseLodging)));
  const lengthLodging = money(baseLodging - lengthDiscount);
  const candidates = input.discounts.filter((d) => !(d.booking_option_id ?? '').trim());

  const timedPrices: number[] = [];
  const savingsByOffer = new Map<string, number>();
  for (let i = 0; i < nights.length; i += 1) {
    const base = bases[i] ?? 0;
    const day = nights[i] ?? '';
    let best = base;
    let bestId: string | null = null;
    for (const row of candidates) {
      if (!offerApplies(row, day)) continue;
      const next = applyOfferUnit(base, row);
      const cheaper = next < best - 0.0001;
      const tie =
        bestId != null &&
        Math.abs(next - best) <= 0.0001 &&
        next < base - 0.0001 &&
        (row.id ?? '') !== '' &&
        (row.id ?? '') < bestId;
      if (cheaper || (bestId == null && next < base - 0.0001) || tie) {
        best = next;
        bestId = next < base - 0.0001 ? (row.id ?? null) : null;
      }
    }
    timedPrices.push(money(best));
    if (bestId && best < base - 0.0001) {
      savingsByOffer.set(bestId, (savingsByOffer.get(bestId) ?? 0) + (base - best));
    }
  }

  const timedLodging = money(timedPrices.reduce((sum, n) => sum + n, 0));
  const timedSavings = money(baseLodging - timedLodging);
  const useTimed = timedSavings > 0.004 && timedLodging <= lengthLodging + 0.0001;

  if (useTimed) {
    let appliedDiscountId: string | null = null;
    let topSave = -1;
    for (const [id, save] of savingsByOffer) {
      if (
        save > topSave + 0.0001 ||
        (Math.abs(save - topSave) <= 0.0001 && (appliedDiscountId == null || id < appliedDiscountId))
      ) {
        topSave = save;
        appliedDiscountId = id;
      }
    }
    const winner = candidates.find((d) => d.id === appliedDiscountId);
    const label =
      winner?.type === 'percent'
        ? `Offer (${Math.round(Number(winner.value))}% off eligible nights)`
        : 'Offer (discounted nights)';
    // Keep base nightly rates on the quote; subtract savings as a single discount line
    // (same shape as weekly/monthly — never stacked with them).
    return {
      nightlyPrices: bases.map((n) => money(n)),
      lodging: baseLodging,
      discount: timedSavings,
      discountLabel: label,
      appliedDiscountId,
    };
  }

  return {
    nightlyPrices: bases.map((n) => money(n)),
    lodging: baseLodging,
    discount: lengthDiscount,
    discountLabel: lengthDiscount > 0.004 ? input.lengthOfStayLabel : null,
    appliedDiscountId: null,
  };
}
