/**
 * Catalog “from” price is not always the cheapest booking option.
 *
 * Booking options are a generic list (name + price). Partners often use them as
 * participant types (Adult / Child) rather than product variants (Small group / Private).
 * Advertising the child price as “From …” without context is misleading.
 */

export type PricedNamedOption = {
  name: string;
  priceUsd: number;
};

export type ParticipantKind = 'adult' | 'reduced' | 'other';

export type HeadlinePick<T extends PricedNamedOption> = {
  option: T | null;
  /** How the catalog should present this price. */
  mode: 'participant-standard' | 'from-minimum' | 'single' | 'empty';
  /** Short unit for “From €189 per adult”. */
  qualifier: string | null;
};

const ADULT_RE = /\b(adults?|grown[-\s]?ups?)\b/i;
const CHILD_RE = /\b(child|children|kids?|infants?|toddlers?|bab(?:y|ies))\b/i;
const YOUTH_RE = /\b(youth|teen(?:ager)?s?|students?|seniors?|pensioners?)\b/i;

export function participantKindFromName(name: string): ParticipantKind {
  const n = (name ?? '').trim();
  if (!n) return 'other';
  if (ADULT_RE.test(n) && !CHILD_RE.test(n)) return 'adult';
  if (CHILD_RE.test(n) || YOUTH_RE.test(n)) return 'reduced';
  return 'other';
}

export function qualifierFromOptionName(name: string): string {
  const n = (name ?? '').trim();
  if (/\badults?\b/i.test(n)) return 'adult';
  if (/\bchildren\b|\bchild\b/i.test(n)) return 'child';
  if (/\bkids?\b/i.test(n)) return 'child';
  if (/\binfants?\b/i.test(n)) return 'infant';
  if (/\btoddlers?\b/i.test(n)) return 'toddler';
  if (/\bseniors?\b/i.test(n)) return 'senior';
  if (/\bstudents?\b/i.test(n)) return 'student';
  if (/\byouth\b/i.test(n)) return 'youth';
  return n.toLowerCase();
}

function pricedOptions<T extends PricedNamedOption>(opts: T[]): T[] {
  return opts.filter((o) => typeof o.priceUsd === 'number' && Number.isFinite(o.priceUsd) && o.priceUsd > 0);
}

function cheapest<T extends PricedNamedOption>(opts: T[]): T {
  return opts.reduce((a, b) => (a.priceUsd <= b.priceUsd ? a : b));
}

/**
 * Choose the listing headline option.
 *
 * - Adult + child/youth (or similar): headline is the adult/standard price, never the reduced fare.
 * - Only reduced types: still qualify the unit (“/ child”) so it is not a generic “from”.
 * - Product variants (private vs small group): cheapest “From” is truthful.
 */
export function pickHeadlineOption<T extends PricedNamedOption>(opts: T[]): HeadlinePick<T> {
  const priced = pricedOptions(opts);
  if (priced.length === 0) return { option: null, mode: 'empty', qualifier: null };

  if (priced.length === 1) {
    const kind = participantKindFromName(priced[0].name);
    return {
      option: priced[0],
      mode: 'single',
      qualifier: kind === 'other' ? null : qualifierFromOptionName(priced[0].name),
    };
  }

  const classified = priced.map((o) => ({ o, kind: participantKindFromName(o.name) }));
  const adults = classified.filter((c) => c.kind === 'adult').map((c) => c.o);
  const reduced = classified.filter((c) => c.kind === 'reduced').map((c) => c.o);

  if (adults.length >= 1 && reduced.length >= 1) {
    const adult = cheapest(adults);
    return {
      option: adult,
      mode: 'participant-standard',
      qualifier: qualifierFromOptionName(adult.name),
    };
  }

  if (reduced.length === priced.length) {
    const pick = cheapest(priced);
    return {
      option: pick,
      mode: 'participant-standard',
      qualifier: qualifierFromOptionName(pick.name),
    };
  }

  return {
    option: cheapest(priced),
    mode: 'from-minimum',
    qualifier: null,
  };
}

/** Persist / filter / SEO starting price: adult/standard when participant types exist. */
export function headlineStartingAmount(opts: PricedNamedOption[], fallback = 0): number {
  const pick = pickHeadlineOption(opts);
  if (pick.option && pick.option.priceUsd > 0) return pick.option.priceUsd;
  return fallback;
}

/** Compact line under a card: “Adult €189 · Child €149” when that mix exists. */
export function participantPriceSummary(
  opts: PricedNamedOption[],
  formatAmount: (n: number) => string
): string | null {
  const priced = pricedOptions(opts).filter((o) => o.name.trim());
  const kinds = priced.map((o) => participantKindFromName(o.name));
  if (!kinds.includes('adult') || !kinds.includes('reduced')) return null;
  return [...priced]
    .sort((a, b) => b.priceUsd - a.priceUsd)
    .map((o) => `${o.name.trim()} ${formatAmount(o.priceUsd)}`)
    .join(' · ');
}
