/**
 * Detects likely off-platform booking solicitation in public listing text.
 * Legitimate safety notes (e.g. “call the guide if you are late”) are not treated as hard blocks
 * unless they also include clear off-platform booking/payment language.
 */

export type OffPlatformTextIssue = {
  kind: 'url' | 'email' | 'phone' | 'off_platform_booking' | 'off_platform_payment';
  message: string;
};

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE =
  /(?:\+|00)\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{0,4}|\b0\d{2,3}[\s.-]?\d{3,4}[\s.-]?\d{2,4}\b/;
const BOOK_OFF_RE =
  /\b(?:book\s+(?:directly|via|outside|with\s+us\s+at)|contact\s+us\s+to\s+book|reserve\s+outside|pay\s+(?:us\s+)?directly|wire\s+transfer|bank\s+transfer\s+to\s+book|venmo|paypal\.me|cashapp)\b/i;
const PAY_OFF_RE =
  /\b(?:pay\s+outside|payment\s+outside|do\s+not\s+pay\s+(?:on|via)\s+traverion|bypass\s+(?:the\s+)?(?:platform|booking))\b/i;

export function findOffPlatformListingTextIssues(text: string): OffPlatformTextIssue[] {
  const t = text.trim();
  if (!t) return [];
  const out: OffPlatformTextIssue[] = [];
  if (URL_RE.test(t)) {
    out.push({
      kind: 'url',
      message: 'Remove external booking links from public listing text.',
    });
  }
  if (EMAIL_RE.test(t)) {
    out.push({
      kind: 'email',
      message: 'Remove email addresses used for direct booking from public listing text.',
    });
  }
  if (BOOK_OFF_RE.test(t) || PAY_OFF_RE.test(t)) {
    out.push({
      kind: 'off_platform_booking',
      message: 'Do not ask guests to book or pay outside Traverion.',
    });
  } else if (PHONE_RE.test(t) && /\b(?:book|reserve|pay|payment|whatsapp)\b/i.test(t)) {
    out.push({
      kind: 'phone',
      message:
        'Do not publish phone numbers for off-platform booking. Use Booking contact number for confirmed guests.',
    });
  }
  return out;
}

export function listingPublicTextHasOffPlatformIssues(text: string): boolean {
  return findOffPlatformListingTextIssues(text).length > 0;
}
