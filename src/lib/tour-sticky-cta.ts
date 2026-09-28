/**
 * Mobile sticky CTA labels for tour listing — name the missing step, don't imply checkout is ready.
 */
import { TRAVELER_CONTINUE_TEST_CTA } from './booking-confirmation-copy';

export function tourStickyBookCtaLabel(params: {
  hasDate: boolean;
  hasOption: boolean;
  needsDeparture: boolean;
  checking?: boolean;
  variantsOpen?: boolean;
  soldOut?: boolean;
  /** Age-mix / quote failed — do not imply Continue is ready. */
  quoteInvalid?: boolean;
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
  if (params.hasOption && params.quoteInvalid) return 'Fix guests';
  if (params.hasOption) return TRAVELER_CONTINUE_TEST_CTA;
  if (params.variantsOpen) return 'Choose option';
  return 'See options';
}
