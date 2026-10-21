import { offerApplies, type OfferPriceRow } from './offer-eligibility';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyOfferUnit(base: number, row: OfferPriceRow): number {
  if (row.type === 'percent') {
    return money(base * (1 - Number(row.value) / 100));
  }
  return money(Math.max(0, base - Number(row.value)));
}

/**
 * Apply listing Offers to stay nights without stacking onto weekly/monthly length discounts.
 * Eligible nights (inside the Discount period) use the best applicable listing-wide offer.
 * The lower lodging total wins: timed Offers vs weekly/monthly. Never both.
 */
export function resolveStayLodgingWithOffers(input: {
  nightDates: string[];
  baseNightlyPrices: number[];
  lengthOfStayDiscount: number;
  lengthOfStayLabel: string | null;
  discounts: readonly OfferPriceRow[];
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

  // Stay Offers are listing-scoped (no tour booking options).
  const candidates = input.discounts.filter((d) => !(d.booking_option_id ?? '').trim());

  const timedPrices: number[] = [];
  const savingsByOffer = new Map<string, number>();
  for (let i = 0; i < nights.length; i += 1) {
    const base = bases[i] ?? 0;
    const day = nights[i] ?? '';
    let best = base;
    let bestId: string | null = null;
    for (const row of candidates) {
      if (!offerApplies(row, { optionId: null, activityDay: day, bookingDay: day })) continue;
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
      if (save > topSave + 0.0001 || (Math.abs(save - topSave) <= 0.0001 && (appliedDiscountId == null || id < appliedDiscountId))) {
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
