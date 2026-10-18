/**
 * Stay guest ages and counted occupancy.
 * Infants can be excluded from the maximum. The quote and checkout use the counted total,
 * never a client total that is lower than the party sent with the request.
 * Keep supabase/functions/_shared/stay-guest-party.ts identical.
 */

export type StayGuestPolicy = {
  /** Adults are this age or older. */
  adultMinAge: number;
  /** Children start at this age. Infants are younger. */
  childMinAge: number;
  infantsCountInOccupancy: boolean;
  /** Null uses the accommodation maximum as the infant cap. */
  maxInfants: number | null;
};

export type StayGuestParty = {
  adults: number;
  children: number;
  infants: number;
};

export type StayGuestBreakdownRow = {
  categoryId: string;
  label: string;
  kind: 'adult' | 'child' | 'infant';
  quantity: number;
  unitPrice: number;
};

export const DEFAULT_STAY_GUEST_POLICY: StayGuestPolicy = {
  adultMinAge: 18,
  childMinAge: 2,
  infantsCountInOccupancy: false,
  maxInfants: null,
};

function whole(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < min || n > max) return null;
  return n;
}

export function normalizeStayGuestPolicy(raw: unknown): StayGuestPolicy {
  const o = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const adultMinAge = whole(o.adultMinAge, 13, 25) ?? DEFAULT_STAY_GUEST_POLICY.adultMinAge;
  const childCeiling = adultMinAge - 1;
  const childMinAge = Math.min(childCeiling, whole(o.childMinAge, 1, 24) ?? DEFAULT_STAY_GUEST_POLICY.childMinAge);
  const maxInfants = whole(o.maxInfants, 0, 20);
  return {
    adultMinAge,
    childMinAge,
    infantsCountInOccupancy: o.infantsCountInOccupancy === true,
    maxInfants,
  };
}

export function stayGuestAgeCopy(policyInput: unknown): {
  adult: string;
  child: string;
  infant: string;
  summary: string;
} {
  const policy = normalizeStayGuestPolicy(policyInput);
  const childTop = policy.adultMinAge - 1;
  const infant = policy.childMinAge <= 1 ? 'under 1' : `under ${policy.childMinAge}`;
  const occupancy = policy.infantsCountInOccupancy
    ? 'Infants count toward the maximum.'
    : 'Infants do not count toward the maximum.';
  return {
    adult: `Adults ${policy.adultMinAge}+`,
    child: `Children ${policy.childMinAge}–${childTop}`,
    infant: `Infants ${infant}`,
    summary: `Adults ${policy.adultMinAge}+ · Children ${policy.childMinAge}–${childTop} · Infants ${infant}. ${occupancy}`,
  };
}

export function countedStayGuests(party: StayGuestParty, policyInput: unknown): number {
  const policy = normalizeStayGuestPolicy(policyInput);
  const infants = policy.infantsCountInOccupancy ? party.infants : 0;
  return party.adults + party.children + infants;
}

export function readStayGuestParty(raw: unknown): StayGuestParty | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const adults = whole(o.adults, 0, 50);
  const children = whole(o.children, 0, 50);
  const infants = whole(o.infants, 0, 20);
  if (adults == null || children == null || infants == null) return null;
  return { adults, children, infants };
}

export function validateStayGuestParty(
  party: StayGuestParty,
  policyInput: unknown,
  maxGuests: number
): { ok: true; counted: number; breakdown: StayGuestBreakdownRow[] } | { ok: false; error: string } {
  const policy = normalizeStayGuestPolicy(policyInput);
  const adults = whole(party.adults, 0, 50);
  const children = whole(party.children, 0, 50);
  const infants = whole(party.infants, 0, 20);
  if (adults == null || children == null || infants == null) {
    return { ok: false, error: 'Enter guest counts as whole numbers.' };
  }
  if (adults < 1) return { ok: false, error: 'Add at least one adult.' };
  if (!Number.isFinite(maxGuests) || maxGuests < 1) {
    return { ok: false, error: 'Guest capacity is unavailable for this stay.' };
  }
  const cap = Math.floor(maxGuests);
  const infantCap = policy.maxInfants ?? Math.min(20, cap);
  if (infants > infantCap) {
    return {
      ok: false,
      error:
        infantCap === 0
          ? 'This stay does not allow infants.'
          : `This stay allows up to ${infantCap} ${infantCap === 1 ? 'infant' : 'infants'}.`,
    };
  }
  const counted = adults + children + (policy.infantsCountInOccupancy ? infants : 0);
  if (counted > cap) return { ok: false, error: `This stay allows up to ${cap} guests.` };
  if (counted < 1) return { ok: false, error: 'Enter how many guests will stay.' };
  const breakdown: StayGuestBreakdownRow[] = [];
  if (adults > 0) breakdown.push({ categoryId: 'stay-adult', label: 'Adult', kind: 'adult', quantity: adults, unitPrice: 0 });
  if (children > 0) breakdown.push({ categoryId: 'stay-child', label: 'Child', kind: 'child', quantity: children, unitPrice: 0 });
  if (infants > 0) breakdown.push({ categoryId: 'stay-infant', label: 'Infant', kind: 'infant', quantity: infants, unitPrice: 0 });
  return { ok: true, counted, breakdown };
}
