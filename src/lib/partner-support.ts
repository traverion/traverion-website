/** Partner Support Center — request classification (client + mirrored in edge). */

export {
  COMM_MAX_ATTACHMENTS as PARTNER_SUPPORT_MAX_ATTACHMENTS,
  COMM_MAX_VIDEO_BYTES as PARTNER_SUPPORT_MAX_FILE_BYTES,
  COMM_MIME_RULES,
} from './communication-attachments';

export const PARTNER_SUPPORT_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const PARTNER_SUPPORT_REQUEST_TYPES = [
  { value: 'problem', label: 'Report a problem or error' },
  { value: 'help', label: 'Request help' },
  { value: 'question', label: 'General question' },
  { value: 'feature', label: 'Suggest a feature or improvement' },
  { value: 'other', label: 'Other' },
] as const;

export type PartnerSupportRequestType = (typeof PARTNER_SUPPORT_REQUEST_TYPES)[number]['value'];

export const PARTNER_SUPPORT_RELATED_AREAS = [
  { value: 'bookings', label: 'Bookings & Reservations' },
  { value: 'tours', label: 'Tours & Activities' },
  { value: 'stays', label: 'Stays' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'listings', label: 'Listings & Publishing' },
  { value: 'availability', label: 'Availability & Calendars' },
  { value: 'pickups', label: 'Pickups' },
  { value: 'payments', label: 'Payments & Payouts' },
  { value: 'offers', label: 'Offers & Discounts' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'inbox', label: 'Inbox & Messages' },
  { value: 'account', label: 'Account & Verification' },
  { value: 'other', label: 'Other' },
] as const;

export type PartnerSupportRelatedArea = (typeof PARTNER_SUPPORT_RELATED_AREAS)[number]['value'];

export function partnerSupportTypeLabel(value: string): string {
  return PARTNER_SUPPORT_REQUEST_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function partnerSupportAreaLabel(value: string): string {
  return PARTNER_SUPPORT_RELATED_AREAS.find((t) => t.value === value)?.label ?? value;
}

export function partnerSupportEmailSubjectTag(type: string): string {
  switch (type) {
    case 'problem':
      return 'Problem';
    case 'help':
      return 'Help';
    case 'question':
      return 'Question';
    case 'feature':
      return 'Feature';
    default:
      return 'Other';
  }
}

export function isPartnerSupportRequestType(value: string): value is PartnerSupportRequestType {
  return PARTNER_SUPPORT_REQUEST_TYPES.some((t) => t.value === value);
}

export function isPartnerSupportRelatedArea(value: string): value is PartnerSupportRelatedArea {
  return PARTNER_SUPPORT_RELATED_AREAS.some((t) => t.value === value);
}
