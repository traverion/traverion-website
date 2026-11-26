/**
 * Partner-facing help tip copy — shown only when the supplier opens a ? tip.
 * Keep main UI short; put clarification here once.
 */

export const PARTNER_HELP = {
  brandName: 'Shown to travelers on your listings.',
  legalName: 'Use the exact name on your official registration.',
  businessType: 'Company means a registered entity. Individual means a sole trader.',
  registrationNumber: 'Your company ID from the business register (Finland: Y-tunnus from YTJ/PRH).',
  taxId: 'Your personal or business tax ID as a sole trader.',
  vatId: 'VAT identification number for your registered company.',
  managingDirectors: 'People authorized to represent the company. Add one name per field.',
  contactPhone: 'A number Traverion can use if we need to reach you.',
  registeredAddress: 'The official registered address of the business.',
  registrationDocument:
    'Official company registration proof only — for Finland, a PRH Trade Register extract (kaupparekisteriote) or equivalent YTJ registry evidence. Marketing posters, brochures, and websites are not accepted. Clear PDF or image, max 10 MB.',
  businessStatus: 'Business approval is separate from payout verification. Saved details are not the same as verified.',
  payoutStatus: 'Bank and identity checks are separate from business approval. Saved payout details are not payout readiness.',
  underReview: 'We are checking your details. You can draft listings while you wait.',
  actionRequired: 'Update what we asked for (often the registration document), then submit again.',
  verified: 'This check is complete. You do not need to resubmit unless something changes.',
  incomplete: 'Finish the required details, then submit for review.',
  payoutSchedule: 'How often you prefer payouts once Traverion enables them.',
  payoutThreshold: 'Minimum balance before a payout is prepared.',
  bankAccount: 'Account numbers stay with our payment partner. Traverion only shows a masked summary.',
  identityCheck: 'Confirms you are authorized for this business. Documents stay with our payment partner.',
  representative: 'The person authorized to manage payouts for this business.',
  beneficialOwners:
    'People who own 25% or more (or who verification requires you to declare). Company directors are listed separately in business details — do not treat them as owners automatically.',
  payoutBusinessSummary:
    'These details come from your approved business profile. Edit them only through business details so payouts stay consistent with verification.',
  ownerConfirm: 'Required confirmation that you may submit this business for review.',
  publishGate: 'Publishing needs both business and payout verification.',
} as const;

export type PartnerHelpKey = keyof typeof PARTNER_HELP;
