export function reviewProductKindLabel(kind: string): string {
  if (kind === 'ticket') return 'Ticket or entry';
  if (kind === 'transportation') return 'Transportation';
  if (kind === 'tour') return 'Tour/activity';
  return 'Not set';
}

export function reviewBasicsSummary(title: string, kind: string, languageLabel: string): string {
  const name = title.trim() || 'Untitled listing';
  return [name, reviewProductKindLabel(kind), languageLabel.trim() || null].filter(Boolean).join(' · ');
}

export function reviewDetailsSummary(
  city: string,
  country: string,
  includesCount: number,
  excludesCount: number
): string {
  const place = [city.trim(), country.trim()].filter(Boolean).join(', ') || 'Location not set';
  return `${place} · ${includesCount} inclusion${includesCount === 1 ? '' : 's'} · ${excludesCount} exclusion${
    excludesCount === 1 ? '' : 's'
  }`;
}

export function reviewStayLocationSummary(city: string, country: string): string {
  return [city.trim(), country.trim()].filter(Boolean).join(', ') || 'Location not set';
}

export function reviewOptionsSummary(
  readyCount: number,
  optionCount: number,
  priceSummary: string
): string {
  if (optionCount === 0) return 'No bookable options yet';
  if (readyCount === 0) {
    return `${optionCount} draft${optionCount === 1 ? '' : 's'} — none ready to book`;
  }
  const price = priceSummary.trim();
  return `${readyCount} bookable option${readyCount === 1 ? '' : 's'}${price ? ` · ${price}` : ''}`;
}

export function reviewStayPricingSummary(nightlyLabel: string, guests: string): string {
  const price = nightlyLabel.trim() || 'Nightly price not set';
  const g = guests.trim();
  return g ? `${price} · ${g} guests` : price;
}

export function reviewPhotosSummary(photoCount: number, coverSelected: boolean): string {
  if (photoCount <= 0) return 'No photos yet';
  if (!coverSelected) return `${photoCount} photo${photoCount === 1 ? '' : 's'} · cover missing`;
  return `${photoCount} photo${photoCount === 1 ? '' : 's'} · Cover selected`;
}

export function listingPublishTruth(args: {
  listingReady: boolean;
  accountEligible: boolean;
  listingMissing: string | null;
  accountReason: string | null;
}): {
  listingLine: string;
  accountLine: string | null;
  canPublish: boolean;
  bannerTitle: string | null;
  bannerBody: string | null;
} {
  const listingLine = args.listingReady
    ? 'Your listing is ready.'
    : args.listingMissing || 'This listing still needs required details before it can go live.';
  const accountLine = args.accountEligible
    ? null
    : args.accountReason ||
      'Traverion must verify your business and payout (IBAN + BIC) before this listing can go live.';
  const canPublish = args.listingReady && args.accountEligible;
  if (args.accountEligible) {
    return {
      listingLine,
      accountLine,
      canPublish,
      bannerTitle: null,
      bannerBody: null,
    };
  }
  return {
    listingLine,
    accountLine,
    canPublish,
    bannerTitle: 'Verification required before publishing',
    bannerBody: accountLine,
  };
}
