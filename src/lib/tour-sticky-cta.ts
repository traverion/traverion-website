/**
 * Mobile sticky CTA labels for tour listing — name the missing step, don't imply checkout is ready.
 */
export function tourStickyBookCtaLabel(params: {
  hasDate: boolean;
  hasOption: boolean;
  needsDeparture: boolean;
  checking?: boolean;
  variantsOpen?: boolean;
}): string {
  if (params.checking) return 'Checking…';
  if (!params.hasDate) return 'Pick a date';
  if (params.hasOption && params.needsDeparture) return 'Pick time';
  if (params.hasOption) return 'Continue · TEST';
  if (params.variantsOpen) return 'Choose option';
  return 'See options';
}
