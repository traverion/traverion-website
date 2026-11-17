import { Building2, Lock } from 'lucide-react';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import {
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
  partnerPayoutReviewState,
  partnerPayoutStatusChip,
  type PartnerReviewState,
} from '../../lib/partnerVerificationStatus';
import { getSupplierBusinessProfileMissingReasons } from '../../lib/supplierOnboarding';
import { verificationDocumentBasename } from '../../data/supabase-supplier-profile';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import { BUSINESS_SETTINGS_CONTENT_CLASS, InfoGrid, InfoRow, ProfileCard } from './businessProfileUi';

function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '');
  if (compact.length < 8) return compact ? '••••' : '—';
  return `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`;
}

function openWizard(step?: string) {
  const q = step ? `?step=${encodeURIComponent(step)}` : '';
  navigateSupplierUrl(`${PARTNER_APP_BASE}/business-setup${q}`);
}

function openPayoutWizard(focus?: string) {
  const q = focus ? `?focus=${encodeURIComponent(focus)}` : '';
  navigateSupplierUrl(`${PARTNER_APP_BASE}/verification${q}`);
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
        <NoticeCallout title={businessReview === 'rejected' ? 'Updates required' : 'Continue setup'} tone="info">
          <p className="mb-3">
            {businessReview === 'rejected'
              ? 'Traverion asked for corrections. Open business setup to update and resubmit.'
              : 'Initial business verification uses the full-screen setup wizard. This page is a summary after you submit.'}
          </p>
          {missing.length > 0 ? (
            <ul className="mb-3 list-inside list-disc text-[12px] text-ink-muted">
              {missing.slice(0, 5).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {p.businessVerificationFeedback.trim() ? (
            <p className="mb-3 text-[13px] text-ink">
              <span className="font-semibold">Traverion note: </span>
              {p.businessVerificationFeedback.trim()}
            </p>
          ) : null}
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
          Traverion is reviewing your business application. You can keep drafting listings while you wait.
        </NoticeCallout>
      ) : null}

      <ProfileCard
        title="Business information"
        description="Read-only summary of your submitted company profile."
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
            label={p.businessType === 'individual' ? 'Tax / business ID' : 'Registration number'}
            value={
              p.businessType === 'individual' ? p.taxId : p.companyRegistrationNumber
            }
          />
          <InfoRow label="VAT ID" value={p.vatId} />
          <InfoRow label="Contact phone" value={p.contactPhone} />
          <InfoRow label="Registered address" value={addressLine || null} />
          <InfoRow label="Managing directors" value={p.managingDirectors} />
        </InfoGrid>
      </ProfileCard>

      <ProfileCard title="Verification">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusChip tone={busChip.tone}>{busChip.label}</StatusChip>
          {businessReview === 'verified' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <Lock className="h-3 w-3" aria-hidden />
              Locked after approval
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
            label="Registration document"
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
                    ? 'Awaiting Traverion review'
                    : null
            }
          />
        </InfoGrid>
        {p.businessVerificationFeedback.trim() ? (
          <p className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
            <span className="font-semibold">Review note: </span>
            {p.businessVerificationFeedback.trim()}
          </p>
        ) : null}
      </ProfileCard>

      <ProfileCard
        title="Payouts"
        description="Banking and payout verification stay separate from business approval."
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
        <div className="mb-3">
          <StatusChip tone={payChip.tone}>{payChip.label}</StatusChip>
        </div>
        <InfoGrid>
          <InfoRow label="Bank account" value={maskIban(p.payoutIban)} />
          <InfoRow label="BIC" value={p.payoutBic.trim() ? '••••' : '—'} />
          <InfoRow label="Payout schedule" value={payoutSchedule} />
          <InfoRow
            label="Minimum threshold"
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
