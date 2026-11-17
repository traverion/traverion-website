/**
 * Partner-facing help tip copy — shown only when the supplier opens a ? tip.
 * Keep main UI short; put clarification here once.
 */

export const PARTNER_HELP = {
  brandName: 'Shown to travelers on your listings.',
  legalName: 'Use the exact name on your official registration.',
  businessType: 'Company means a registered entity. Individual means a sole trader.',
  registrationNumber: 'Your company ID from the business register.',
  taxId: 'Your personal or business tax ID as a sole trader.',
  vatId: 'VAT identification number for your registered company.',
  managingDirectors: 'People authorized to represent the company. Add one name per field.',
  contactPhone: 'A number Traverion can use if we need to reach you.',
  registeredAddress: 'The official registered address of the business.',
  registrationDocument: 'Clear PDF or image of official registration proof. Max 5 MB.',
  businessStatus: 'Business approval is separate from payout verification.',
  payoutStatus: 'Bank and identity checks are separate from business approval.',
  underReview: 'We are checking your details. You can draft listings while you wait.',
  actionRequired: 'Update what we asked for, then submit again.',
  verified: 'This check is complete. You do not need to resubmit unless something changes.',
  incomplete: 'Finish the required details, then submit for review.',
  payoutSchedule: 'How often you prefer payouts once Traverion enables them.',
  payoutThreshold: 'Minimum balance before a payout is prepared.',
  bankAccount: 'Account numbers stay with our payment partner. Traverion only shows a masked summary.',
  identityCheck: 'Confirms you are authorized for this business. Documents stay with our payment partner.',
  representative: 'The person authorized to manage payouts for this business.',
  beneficialOwners:
    'People who own 25% or more (or who Stripe asks you to declare). Company directors are listed separately in business details — do not treat them as owners automatically.',
  payoutBusinessSummary:
    'These details come from your approved business profile. Edit them only through business details so payouts stay consistent with verification.',
  ownerConfirm: 'Required confirmation that you may submit this business for review.',
  publishGate: 'Publishing needs both business and payout verification.',
} as const;

export type PartnerHelpKey = keyof typeof PARTNER_HELP;
