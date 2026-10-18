/**
 * Stay add-ons on top of the nightly lodging quote.
 * One length-of-stay discount applies, and only to the nightly total.
 * Extra-guest fees, cleaning, and extras are not discounted and do not stack with each other.
 * Keep supabase/functions/_shared/stay-price.ts identical.
 */

export const STAY_EXTRA_PRESETS = [
  'Parking',
  'Outdoor sauna',
  'Breakfast',
  'Airport transfer',
  'Early check-in',
  'Late checkout',
  'Firewood',
] as const;

export type StayExtraCharge = 'per_stay' | 'per_night' | 'per_guest' | 'per_guest_night';

export type StayPaidExtra = {
  id: string;
  name: string;
  description: string;
  price: number;
  charge: StayExtraCharge;
  mandatory: boolean;
  maxQuantity: number;
};

export type StayExtraSelection = {
  id: string;
  quantity: number;
};

export type StayPricedExtra = {
  id: string;
  name: string;
  amount: number;
  quantity: number;
  mandatory: boolean;
};

const CHARGES = new Set<StayExtraCharge>(['per_stay', 'per_night', 'per_guest', 'per_guest_night']);

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function whole(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < min || n > max) return null;
  return n;
}

export function normalizeStayPaidExtra(raw: unknown): StayPaidExtra | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim().slice(0, 80) : '';
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
  if (!id || !name) return null;
  const price = typeof o.price === 'number' && o.price > 0 ? money(o.price) : null;
  if (price == null || price > 100000) return null;
  const charge = typeof o.charge === 'string' && CHARGES.has(o.charge as StayExtraCharge) ? (o.charge as StayExtraCharge) : null;
  if (!charge) return null;
  return {
    id,
    name,
    description: typeof o.description === 'string' ? o.description.trim().slice(0, 160) : '',
    price,
    charge,
    mandatory: o.mandatory === true,
    maxQuantity: whole(o.maxQuantity, 1, 20) ?? 1,
  };
}

export function normalizeStayPaidExtras(raw: unknown): StayPaidExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: StayPaidExtra[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const extra = normalizeStayPaidExtra(row);
    if (!extra || seen.has(extra.id)) continue;
    seen.add(extra.id);
    out.push(extra);
    if (out.length >= 12) break;
  }
  return out;
}

export function readStayExtraSelection(raw: unknown): StayExtraSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: StayExtraSelection[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (row == null || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim().slice(0, 80) : '';
    const quantity = whole(o.quantity, 1, 20);
    if (!id || quantity == null || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, quantity });
    if (out.length >= 12) break;
  }
  return out;
}

export function stayExtraChargeLabel(charge: StayExtraCharge): string {
  if (charge === 'per_night') return 'Per night';
  if (charge === 'per_guest') return 'Per guest';
  if (charge === 'per_guest_night') return 'Per guest, per night';
  return 'Per stay';
}

function extraAmount(extra: StayPaidExtra, quantity: number, nights: number, guests: number): number {
  const base =
    extra.charge === 'per_night'
      ? extra.price * nights
      : extra.charge === 'per_guest'
        ? extra.price * guests
        : extra.charge === 'per_guest_night'
          ? extra.price * guests * nights
          : extra.price;
  return money(base * quantity);
}

export function priceStayAddOns(input: {
  lodging: number;
  nights: number;
  countedGuests: number;
  includedGuests?: number | null;
  extraGuestNightly?: number | null;
  weeklyDiscountPercent?: number | null;
  monthlyDiscountPercent?: number | null;
  extras?: readonly StayPaidExtra[] | null;
  selected?: readonly StayExtraSelection[] | null;
}):
  | {
      ok: true;
      extraGuestCount: number;
      extraGuestFee: number;
      discount: number;
      discountLabel: string | null;
      extraLines: StayPricedExtra[];
      offeredExtras: StayPaidExtra[];
    }
  | { ok: false; error: string } {
  const nights = Math.floor(input.nights);
  const guests = Math.floor(input.countedGuests);
  if (nights < 1 || guests < 1) return { ok: false, error: 'Choose dates and guests before pricing extras.' };
  const catalog = normalizeStayPaidExtras(input.extras ?? []);
  const byId = new Map(catalog.map((extra) => [extra.id, extra]));
  const selected = new Map<string, number>();
  for (const row of input.selected ?? []) {
    if (!byId.has(row.id)) return { ok: false, error: 'That extra is not offered for these dates.' };
    selected.set(row.id, row.quantity);
  }
  const extraLines: StayPricedExtra[] = [];
  for (const extra of catalog) {
    const asked = selected.get(extra.id) ?? 0;
    const quantity = extra.mandatory ? Math.max(1, Math.min(extra.maxQuantity, asked || 1)) : Math.min(extra.maxQuantity, asked);
    if (!extra.mandatory && quantity < 1) continue;
    extraLines.push({
      id: extra.id,
      name: extra.name,
      quantity,
      mandatory: extra.mandatory,
      amount: extraAmount(extra, quantity, nights, guests),
    });
  }
  const included = input.includedGuests != null && input.includedGuests >= 1 ? Math.floor(input.includedGuests) : null;
  const rate = input.extraGuestNightly != null && input.extraGuestNightly > 0 ? money(input.extraGuestNightly) : null;
  const extraGuestCount = included != null && rate != null ? Math.max(0, guests - included) : 0;
  const extraGuestFee = extraGuestCount > 0 && rate != null ? money(extraGuestCount * rate * nights) : 0;
  const weekly = input.weeklyDiscountPercent != null && input.weeklyDiscountPercent >= 1 ? Math.min(90, Math.floor(input.weeklyDiscountPercent)) : null;
  const monthly = input.monthlyDiscountPercent != null && input.monthlyDiscountPercent >= 1 ? Math.min(90, Math.floor(input.monthlyDiscountPercent)) : null;
  let discount = 0;
  let discountLabel: string | null = null;
  if (nights >= 28 && monthly != null) {
    discountLabel = `Monthly discount (${monthly}% off the nightly rate)`;
    discount = money((input.lodging * monthly) / 100);
  } else if (nights >= 7 && weekly != null) {
    discountLabel = `Weekly discount (${weekly}% off the nightly rate)`;
    discount = money((input.lodging * weekly) / 100);
  }
  if (discount > input.lodging) discount = money(input.lodging);
  return { ok: true, extraGuestCount, extraGuestFee, discount, discountLabel, extraLines, offeredExtras: catalog };
}

export function stayChargeLines(input: {
  nights: number;
  nightlyPrice: number;
  nightlyPrices?: number[];
  cleaningFee: number;
  extraGuestCount?: number;
  extraGuestFee?: number;
  discount?: number;
  discountLabel?: string | null;
  extraLines?: readonly { name: string; amount: number; quantity: number }[];
}): { label: string; amount: number }[] {
  const prices = input.nightlyPrices ?? [];
  const mixed = prices.length === input.nights && prices.some((price) => price !== prices[0]);
  const lines: { label: string; amount: number }[] = [];
  if (mixed) {
    let index = 0;
    while (index < prices.length) {
      const price = prices[index];
      let count = 1;
      while (index + count < prices.length && prices[index + count] === price) count += 1;
      lines.push({
        label: `${price} / night × ${count} night${count === 1 ? '' : 's'}`,
        amount: money(price * count),
      });
      index += count;
    }
  } else {
    lines.push({
      label: `Nightly rate × ${input.nights} night${input.nights === 1 ? '' : 's'}`,
      amount: money(input.nightlyPrice * input.nights),
    });
  }
  if ((input.extraGuestFee ?? 0) > 0) {
    lines.push({
      label: `Extra guest × ${input.extraGuestCount ?? 0} × ${input.nights} night${input.nights === 1 ? '' : 's'}`,
      amount: input.extraGuestFee ?? 0,
    });
  }
  if (input.cleaningFee > 0) lines.push({ label: 'Cleaning', amount: input.cleaningFee });
  for (const extra of input.extraLines ?? []) {
    lines.push({
      label: extra.quantity > 1 ? `${extra.name} × ${extra.quantity}` : extra.name,
      amount: extra.amount,
    });
  }
  if ((input.discount ?? 0) > 0 && input.discountLabel) {
    lines.push({ label: input.discountLabel, amount: -(input.discount ?? 0) });
  }
  return lines;
}
