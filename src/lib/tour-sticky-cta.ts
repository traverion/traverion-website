/**
 * Mobile sticky CTA labels for tour listing — name the missing step, don't imply checkout is ready.
 */
import { TRAVELER_CONTINUE_TEST_CTA } from './booking-confirmation-copy';

/** Phase 1529: map quote failure to an honest CTA (Stay 1520 parity — not always Fix guests). */
export function tourQuoteFailureCtaLabel(
  quoteError?: string | null,
  quoteCode?: string | null
): string {
  const code = String(quoteCode ?? '').trim().toLowerCase();
  const err = String(quoteError ?? '');
  if (code === 'party' || /guest count|guests|party|age mix|participant/i.test(err)) {
    return 'Fix guests';
  }
  if (code === 'price' || /bookable price|does not have a.*price|price/i.test(err)) {
    return 'Price unavailable';
  }
  if (code === 'option' || /booking option|choose a booking option/i.test(err)) {
    return 'Choose option';
  }
  if (code === 'time' || /departure time|choose a departure/i.test(err)) {
    return 'Pick time';
  }
  if (
    code === 'bad_date' ||
    code === 'weekday' ||
    code === 'season' ||
    /choose a (valid )?date|today or later|season|cutoff|no longer bookable|not offered/i.test(err)
  ) {
    return 'Fix date';
  }
  if (code === 'unpublished' || code === 'inventory' || /not available to book/i.test(err)) {
    return 'Unavailable';
  }
  return 'Fix booking';
}

export function tourStickyBookCtaLabel(params: {
  hasDate: boolean;
  hasOption: boolean;
  needsDeparture: boolean;
  checking?: boolean;
  variantsOpen?: boolean;
  soldOut?: boolean;
  /** Age-mix / quote failed — do not imply Continue is ready. */
  quoteInvalid?: boolean;
  /** Phase 1529: quote error text for honest failure labels. */
  quoteError?: string | null;
  /** Phase 1529: quoteBooking failure code when available. */
  quoteCode?: string | null;
  /** Signed-in supplier of this listing — desktop card parity. */
  selfBookBlocked?: boolean;
  /** Eligibility query failed — distinct from confirmed self-book (Phase 1342). */
  selfBookCheckFailed?: boolean;
  /** Day capacity / party bounds could not be verified — desktop card shows retry (Phase 1167). */
  capacityUnknown?: boolean;
}): string {
  if (params.selfBookCheckFailed) return 'Eligibility unavailable';
  if (params.selfBookBlocked) return 'Cannot book own listing';
  if (params.checking) return 'Checking…';
  if (!params.hasDate) return 'Pick a date';
  if (params.hasOption && params.needsDeparture) return 'Pick time';
  if (params.hasOption && params.capacityUnknown) return 'Capacity unavailable';
  if (params.hasOption && params.soldOut) return 'Sold out';
  if (params.hasOption && params.quoteInvalid) {
    return tourQuoteFailureCtaLabel(params.quoteError, params.quoteCode);
  }
  if (params.hasOption) return TRAVELER_CONTINUE_TEST_CTA;
  if (params.variantsOpen) return 'Choose option';
  return 'See options';
}
