import { Building2, Lock } from 'lucide-react';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import {
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
  partnerPayoutReviewState,
  partnerPayoutStatusChip,
  partnerReviewStatusHelp,
  type PartnerReviewState,
} from '../../lib/partnerVerificationStatus';
import { getSupplierBusinessProfileMissingReasons } from '../../lib/supplierOnboarding';
import { verificationDocumentBasename } from '../../data/supabase-supplier-profile';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import PartnerHelpTip from './PartnerHelpTip';
import { BUSINESS_SETTINGS_CONTENT_CLASS, InfoGrid, InfoRow, ProfileCard } from './businessProfileUi';

function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '');
  if (compact.length < 8) return compact ? '••••' : '—';
  return `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`;
}

function openWizard(step?: string) {
  const phase =
    step === 'documents' || step === 'review'
      ? 'documents'
      : step === 'identity' || step === 'contact'
        ? 'business'
        : 'business';
  navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding?phase=${phase}`);
}

function openPayoutWizard(focus?: string) {
  const phase = focus === 'bank' ? 'payout' : 'representative';
  navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding?phase=${phase}`);
}

export type BusinessProfileSummaryProps = {
  canEdit: boolean;
  profileDisplayName: string;
  businessLogoUrl: string;
  companyLegalName: string;
  businessType: string;
  addressCountry: string;
  companyRegistrationNumber: string;
  taxId: string;
  vatId: string;
  contactPhone: string;
  addressStreet: string;
  addressCity: string;
  addressPostalCode: string;
  managingDirectors: string;
  companyRegistrationPath: string;
  verificationStatus: string;
  verificationSubmittedAt: string;
  businessVerificationFeedback: string;
  payoutIban: string;
  payoutBic: string;
  payoutVerificationStatus: string;
  payoutVerificationSubmittedAt: string;
  paymentCycle?: string;
  payoutThreshold?: string;
  onSupport: () => void;
};

export default function BusinessProfileSummary(p: BusinessProfileSummaryProps) {
  const missing = getSupplierBusinessProfileMissingReasons({
    display_name: p.profileDisplayName,
    company_legal_name: p.companyLegalName,
    contact_phone: p.contactPhone,
    address_street: p.addressStreet,
    address_city: p.addressCity,
    address_postal_code: p.addressPostalCode,
    address_country: p.addressCountry,
    business_type: (p.businessType as 'company' | 'individual' | '') || null,
    company_registration_number: p.companyRegistrationNumber,
    tax_id: p.taxId,
    company_registration_document_path: p.companyRegistrationPath,
  });
  const draftComplete = missing.length === 0;
  const businessReview = partnerBusinessReviewState({
    verificationStatus: p.verificationStatus,
    submittedAt: p.verificationSubmittedAt,
    draftComplete,
    feedback: p.businessVerificationFeedback,
  });
  const payoutReview = partnerPayoutReviewState({
    verificationStatus: p.payoutVerificationStatus,
    submittedAt: p.payoutVerificationSubmittedAt,
    hasBankDetails: Boolean(p.payoutIban.trim() && p.payoutBic.trim()),
  });
  const busChip = partnerBusinessStatusChip(businessReview);
  const payChip = partnerPayoutStatusChip(payoutReview);

  const needsContinue =
    businessReview === 'incomplete' || businessReview === 'ready' || businessReview === 'rejected';
  // After request-changes, land on documents when a file already exists so corrections
  // can re-upload without hunting; otherwise resume at the first incomplete step.
  const continueStep =
    !p.profileDisplayName.trim() || !p.companyLegalName.trim() || !p.businessType
      ? 'identity'
      : !p.contactPhone.trim() || !p.addressStreet.trim() || !p.addressCountry.trim()
        ? 'contact'
        : !p.companyRegistrationPath.trim() || businessReview === 'rejected'
          ? 'documents'
          : 'review';

  const addressLine = [p.addressStreet, p.addressPostalCode, p.addressCity, p.addressCountry]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ');

  const payoutSchedule =
    p.paymentCycle === 'monthly'
      ? 'Monthly'
      : p.paymentCycle === 'biweekly'
        ? 'Twice monthly'
        : p.paymentCycle?.trim()
          ? p.paymentCycle
          : '—';

  return (
    <div className={`${BUSINESS_SETTINGS_CONTENT_CLASS} space-y-4`}>
      {needsContinue ? (
        <NoticeCallout
          title={businessReview === 'rejected' ? 'Action required' : 'Continue setup'}
          tone={businessReview === 'rejected' ? 'warn' : 'info'}
        >
          {p.businessVerificationFeedback.trim() ? (
            <p className="mb-3 text-[13px] text-ink">{p.businessVerificationFeedback.trim()}</p>
          ) : missing.length > 0 ? (
            <ul className="mb-3 list-inside list-disc text-[12px] text-ink-muted">
              {missing.slice(0, 5).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-3">Finish business setup to submit for review.</p>
          )}
          {p.canEdit ? (
            <button
              type="button"
              className="tv-btn-primary h-9 px-3 text-[13px]"
              onClick={() => openWizard(continueStep)}
            >
              {businessReview === 'rejected' ? 'Fix and resubmit' : 'Continue setup'}
            </button>
          ) : null}
        </NoticeCallout>
      ) : null}

      {businessReview === 'pending' ? (
        <NoticeCallout title="Under review" tone="warn">
          <span className="inline-flex items-center gap-1.5">
            Details are submitted — not yet verified. You can draft listings while you wait.
            <PartnerHelpTip label="About under review">{PARTNER_HELP.underReview}</PartnerHelpTip>
          </span>
        </NoticeCallout>
      ) : null}

      <ProfileCard
        title="Business"
        actions={
          p.canEdit && (businessReview === 'verified' || businessReview === 'pending') ? (
            <button
              type="button"
              className="tv-btn-secondary h-9 px-3 text-[13px]"
              onClick={() => (businessReview === 'verified' ? p.onSupport() : openWizard('review'))}
            >
              {businessReview === 'verified' ? 'Request changes' : 'View application'}
            </button>
          ) : null
        }
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.04] ring-1 ring-black/[0.06]">
            {p.businessLogoUrl ? (
              <img src={p.businessLogoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-6 w-6 text-ink-faint" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold tracking-tight text-ink">
              {p.profileDisplayName.trim() || '—'}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">{p.companyLegalName.trim() || '—'}</p>
          </div>
        </div>
        <InfoGrid>
          <InfoRow
            label="Business type"
            help={PARTNER_HELP.businessType}
            value={
              p.businessType === 'company'
                ? 'Registered company'
                : p.businessType === 'individual'
                  ? 'Individual trader'
                  : null
            }
          />
          <InfoRow label="Country" value={p.addressCountry} />
          <InfoRow
            label={p.businessType === 'individual' ? 'Tax ID' : 'Registration number'}
            help={p.businessType === 'individual' ? PARTNER_HELP.taxId : PARTNER_HELP.registrationNumber}
            value={
              p.businessType === 'individual' ? p.taxId : p.companyRegistrationNumber
            }
          />
          <InfoRow label="VAT ID" help={PARTNER_HELP.vatId} value={p.vatId} />
          <InfoRow label="Phone" help={PARTNER_HELP.contactPhone} value={p.contactPhone} />
          <InfoRow
            label="Address"
            help={PARTNER_HELP.registeredAddress}
            value={addressLine || null}
          />
          <InfoRow
            label="Directors"
            help={PARTNER_HELP.managingDirectors}
            value={p.managingDirectors}
          />
        </InfoGrid>
      </ProfileCard>

      <ProfileCard title="Verification" help={PARTNER_HELP.businessStatus}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusChip tone={busChip.tone}>{busChip.label}</StatusChip>
          <PartnerHelpTip label="About business status">
            {partnerReviewStatusHelp(businessReview)}
          </PartnerHelpTip>
          {businessReview === 'verified' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <Lock className="h-3 w-3" aria-hidden />
              Locked
            </span>
          ) : null}
        </div>
        <InfoGrid>
          <InfoRow
            label="Submitted"
            value={
              p.verificationSubmittedAt
                ? new Date(p.verificationSubmittedAt).toLocaleString()
                : 'Not submitted'
            }
          />
          <InfoRow
            label="Document"
            help={PARTNER_HELP.registrationDocument}
            value={
              p.companyRegistrationPath
                ? verificationDocumentBasename(p.companyRegistrationPath)
                : 'Not uploaded'
            }
          />
          <InfoRow
            label="Outstanding"
            value={
              businessReview === 'verified'
                ? 'None'
                : missing.length
                  ? missing.join('; ')
                  : businessReview === 'pending'
                    ? 'Awaiting review'
                    : null
            }
          />
        </InfoGrid>
        {p.businessVerificationFeedback.trim() ? (
          <p className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
            {p.businessVerificationFeedback.trim()}
          </p>
        ) : null}
      </ProfileCard>

      <ProfileCard
        title="Payouts"
        help={PARTNER_HELP.payoutStatus}
        actions={
          p.canEdit ? (
            <button
              type="button"
              className="tv-btn-secondary h-9 px-3 text-[13px]"
              onClick={() => openPayoutWizard()}
            >
              Open payout setup
            </button>
          ) : null
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusChip tone={payChip.tone}>{payChip.label}</StatusChip>
          <PartnerHelpTip label="About payout status">
            {partnerReviewStatusHelp(payoutReview)}
          </PartnerHelpTip>
        </div>
        <InfoGrid>
          <InfoRow label="Bank account" help={PARTNER_HELP.bankAccount} value={maskIban(p.payoutIban)} />
          <InfoRow label="BIC" value={p.payoutBic.trim() ? '••••' : '—'} />
          <InfoRow label="Schedule" help={PARTNER_HELP.payoutSchedule} value={payoutSchedule} />
          <InfoRow
            label="Minimum"
            help={PARTNER_HELP.payoutThreshold}
            value={p.payoutThreshold?.trim() ? p.payoutThreshold : '—'}
          />
        </InfoGrid>
      </ProfileCard>
    </div>
  );
}

export function businessReviewNeedsWizard(state: PartnerReviewState): boolean {
  return state === 'incomplete' || state === 'ready' || state === 'rejected';
}
