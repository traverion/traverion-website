/**
 * Email subject lines stored in `contact_inquiries.subject` for you (and Resend) to use as-is.
 * Keep prefixes distinct so inbox rules / Resend routing are easy.
 */
export type InquiryKind = 'general' | 'affiliate' | 'content_creator';

const SUBJECT_TAG: Record<Exclude<InquiryKind, 'content_creator'>, string> = {
  general: '[Traverion · Contact]',
  affiliate: '[Traverion · Affiliate]',
};

function defaultSubjectTail(kind: Exclude<InquiryKind, 'content_creator'>): string {
  switch (kind) {
    case 'affiliate':
      return 'Partnership inquiry';
    default:
      return 'Contact form message';
  }
}

/**
 * Final subject saved to the database → use this string as the outgoing email `Subject` in Resend.
 */
export function buildInquiryEmailSubject(kind: InquiryKind, userSubjectLine: string): string {
  const line = userSubjectLine.trim();

  if (kind === 'content_creator') {
    const base = 'New Content Creator Application';
    const tag = ' [Traverion]';
    if (line) return `${base} — ${line}${tag}`;
    return `${base}${tag}`;
  }

  const tail = line || defaultSubjectTail(kind);
  return `${SUBJECT_TAG[kind]} ${tail}`;
}

export function inquiryKindLabel(kind: InquiryKind): string {
  switch (kind) {
    case 'affiliate':
      return 'Affiliate program';
    case 'content_creator':
      return 'Content creator';
    default:
      return 'General contact';
  }
}
