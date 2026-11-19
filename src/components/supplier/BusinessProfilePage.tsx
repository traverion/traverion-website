import { useEffect, useRef, useState } from 'react';
import { Building2, ImagePlus, Lock, Wallet, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSupplierProfile,
  getVerificationDocumentDisplayLabel,
  openVerificationDocumentPreview,
  patchSupplierProfile,
  removeSupplierBusinessLogoFiles,
  removeSupplierVerificationDocumentFile,
  uploadSupplierBusinessLogo,
  uploadSupplierVerificationDocument,
  verificationDocumentBasename,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { formatSupplierBusinessAddressFromParts } from '../../lib/supplierAddress';
import { getSupplierBusinessProfileMissingReasons } from '../../lib/supplierOnboarding';
import { isSupplierBusinessIdentityLocked } from '../../lib/supplierVerificationLocks';
import { PARTNER_APP_BASE, PARTNER_SUPPORT_PATH } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { supplierPortalPublicBaseUrl } from '../../lib/partnerHost';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { notifySupplierEvent } from '../../data/supabase-supplier-messaging';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import {
  applyLegalDate,
  applyLegalPlaceholders,
  defaultPrivacyPolicyTemplate,
  defaultTermsConditionsTemplate,
} from '../../lib/supplierLegalTemplates';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from './supplierUi';
import PartnerSelect from './PartnerSelect';
import PartnerConfirmModal from './PartnerConfirmModal';
import SupplierTeamPanel from './SupplierTeamPanel';
import NoticeCallout from '../NoticeCallout';
import SupplierVerificationCard from './SupplierVerificationCard';
import { supplierVerificationState } from '../../lib/supplier-verification-state';
import {
  PARTNER_BUSINESS_READY_TO_SUBMIT_NOTE,
  PARTNER_BUSINESS_REVIEW_STATUS_NOTE,
} from '../../lib/booking-confirmation-copy';
import BusinessProfileSummary from './BusinessProfileSummary';
import {
  BUSINESS_SETTINGS_CONTENT_CLASS,
  InfoGrid,
  InfoRow,
  PolicyDocRow,
  ProfileCard,
  SaveBar,
  Subsection,
  profileInputClass,
} from './businessProfileUi';

export type BusinessProfileTab = 'company' | 'legal' | 'team';

const PUBLIC_DESCRIPTION_MAX = 800;

export type BusinessProfilePageProps = {
  user: User | null;
  isSupabase: boolean;
  supabase: SupabaseClient | null;
  handleNavigate: (s: string) => void;
  businessProfileTab: BusinessProfileTab;
  setBusinessProfileTab: (t: BusinessProfileTab) => void;
  payoutIban: string;
  payoutBic: string;
  payoutVerificationStatus: string;
  payoutVerificationSubmittedAt: string;
  paymentCycle?: 'monthly' | 'biweekly' | '';
  payoutThreshold?: string;
  businessVerificationFeedback: string;
  businessType: 'company' | 'individual' | '';
  setBusinessType: (v: 'company' | 'individual' | '') => void;
  profileDisplayName: string;
  setProfileDisplayName: (v: string) => void;
  companyLegalName: string;
  setCompanyLegalName: (v: string) => void;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  companyRegistrationNumber: string;
  setCompanyRegistrationNumber: (v: string) => void;
  managingDirectors: string;
  setManagingDirectors: (v: string) => void;
  addressStreet: string;
  setAddressStreet: (v: string) => void;
  addressCountry: string;
  setAddressCountry: (v: string) => void;
  addressCity: string;
  setAddressCity: (v: string) => void;
  addressPostalCode: string;
  setAddressPostalCode: (v: string) => void;
  taxId: string;
  setTaxId: (v: string) => void;
  vatId: string;
  setVatId: (v: string) => void;
  verificationStatus: string;
  verificationSubmittedAt: string;
  setVerificationSubmittedAt: (v: string) => void;
  businessTypeAtLastFetch: 'company' | 'individual' | '';
  companySaving: boolean;
  companyMessage: 'success' | 'error' | null;
  setCompanySaving: (v: boolean) => void;
  setCompanyMessage: (v: 'success' | 'error' | null) => void;
  updateSupplierCompanyProfile: typeof import('../../data/supabase-supplier-profile').updateSupplierCompanyProfile;
  insurancePolicyNumber: string;
  setInsurancePolicyNumber: (v: string) => void;
  insuranceCoverage: string;
  setInsuranceCoverage: (v: string) => void;
  insuranceStart: string;
  setInsuranceStart: (v: string) => void;
  insuranceEnd: string;
  setInsuranceEnd: (v: string) => void;
  insuranceProvider: string;
  setInsuranceProvider: (v: string) => void;
  privacyPolicyText: string;
  setPrivacyPolicyText: (v: string) => void;
  termsConditionsText: string;
  setTermsConditionsText: (v: string) => void;
  legalSaving: boolean;
  legalMessage: 'success' | 'error' | null;
  setLegalSaving: (v: boolean) => void;
  setLegalMessage: (v: 'success' | 'error' | null) => void;
  legalDocModal: 'privacy' | 'terms' | null;
  setLegalDocModal: (v: 'privacy' | 'terms' | null) => void;
  operatorDisplayName: string;
  businessLogoUrl: string;
  setBusinessLogoUrl: (v: string) => void;
  companyRegistrationPath: string;
  setCompanyRegistrationPath: (v: string) => void;
  setVerificationStatus: (v: string) => void;
  onCompanyProfileSaved: () => void;
};

export default function BusinessProfilePage(p: BusinessProfilePageProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const companyRegInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandSaveError, setBrandSaveError] = useState<string | null>(null);
  const [brandSaveOk, setBrandSaveOk] = useState(false);
  const [descSaving, setDescSaving] = useState(false);
  const [descSaveOk, setDescSaveOk] = useState(false);
  const [descSaveError, setDescSaveError] = useState<string | null>(null);
  const [publicDescription, setPublicDescription] = useState('');
  const [companyRegUploading, setCompanyRegUploading] = useState(false);
  const [companyRegDisplayName, setCompanyRegDisplayName] = useState('');
  const [docError, setDocError] = useState<string | null>(null);
  const [companySaveError, setCompanySaveError] = useState<string | null>(null);
  const [insuranceEditing, setInsuranceEditing] = useState(false);
  const [insuranceDraft, setInsuranceDraft] = useState({
    provider: '',
    policy: '',
    coverage: '',
    start: '',
    end: '',
  });
  const [insuranceLocalError, setInsuranceLocalError] = useState<string | null>(null);
  const [policyDraft, setPolicyDraft] = useState('');
  const [policyDirty, setPolicyDirty] = useState(false);
  const policyDirtyRef = useRef(false);
  const [policyConfirmTemplate, setPolicyConfirmTemplate] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaveError, setPolicySaveError] = useState<string | null>(null);
  const [policyDiscardOpen, setPolicyDiscardOpen] = useState(false);
  const [policySaveOk, setPolicySaveOk] = useState(false);
  const [policyToast, setPolicyToast] = useState<string | null>(null);
  const policySavingRef = useRef(false);

  const { role } = useSupplierRole();
  const canEditProfile = canManageBookings(role);
  const businessLocked = isSupplierBusinessIdentityLocked(
    p.verificationStatus,
    p.verificationSubmittedAt,
    p.businessTypeAtLastFetch,
    p.businessVerificationFeedback
  );
  const identityFieldsDisabled = businessLocked || !canEditProfile;
  const brandLocked = businessLocked;

  const [ownerAuthorityConfirmed, setOwnerAuthorityConfirmed] = useState(false);
  const businessProfileMissingReasons = getSupplierBusinessProfileMissingReasons({
    display_name: p.profileDisplayName,
    company_legal_name: p.companyLegalName,
    contact_phone: p.contactPhone,
    address_street: p.addressStreet,
    address_city: p.addressCity,
    address_postal_code: p.addressPostalCode,
    address_country: p.addressCountry,
    business_type: p.businessType || null,
    company_registration_number: p.companyRegistrationNumber,
    tax_id: p.taxId,
    company_registration_document_path: p.companyRegistrationPath,
  });
  const draftBusinessComplete = businessProfileMissingReasons.length === 0;
  const profileChecklist = [
    Boolean(p.profileDisplayName.trim()),
    Boolean(p.companyLegalName.trim()),
    Boolean(p.businessType),
    Boolean(p.contactPhone.trim()),
    Boolean(p.addressStreet.trim() && p.addressCity.trim() && p.addressPostalCode.trim() && p.addressCountry.trim()),
    p.businessType === 'company'
      ? Boolean(p.companyRegistrationNumber.trim())
      : p.businessType === 'individual'
        ? Boolean(p.taxId.trim())
        : false,
    Boolean(p.companyRegistrationPath?.trim()),
    ownerAuthorityConfirmed,
  ];
  const profileProgressDone = profileChecklist.filter(Boolean).length;
  const profileProgressTotal = profileChecklist.length;
  const readyToSubmitForReview = draftBusinessComplete && ownerAuthorityConfirmed;
  const vBus = p.verificationStatus.trim().toLowerCase();
  const businessInReviewQueue =
    vBus !== 'verified' &&
    vBus !== 'rejected' &&
    (p.verificationSubmittedAt ?? '').trim() !== '' &&
    (p.businessTypeAtLastFetch ?? '').trim() !== '';

  useEffect(() => {
    let cancelled = false;
    if (!p.user?.id) return;
    void fetchSupplierProfile(p.user.id).then((row) => {
      if (cancelled) return;
      setPublicDescription(String((row as { public_description?: string | null } | null)?.public_description ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, [p.user?.id]);

  useEffect(() => {
    let cancelled = false;
    const path = p.companyRegistrationPath?.trim() ?? '';
    if (!path) {
      setCompanyRegDisplayName('');
      return;
    }
    setCompanyRegDisplayName(verificationDocumentBasename(path));
    void getVerificationDocumentDisplayLabel(path).then((label) => {
      if (!cancelled && label) setCompanyRegDisplayName(label);
    });
    return () => {
      cancelled = true;
    };
  }, [p.companyRegistrationPath]);

  useEffect(() => {
    policyDirtyRef.current = policyDirty;
  }, [policyDirty]);

  useEffect(() => {
    if (!p.legalDocModal) {
      setPolicyDirty(false);
      policyDirtyRef.current = false;
      setPolicyConfirmTemplate(false);
      setPolicySaveError(null);
      setPolicySaveOk(false);
      setPolicyDiscardOpen(false);
      return;
    }
    const initial = p.legalDocModal === 'privacy' ? p.privacyPolicyText : p.termsConditionsText;
    setPolicyDraft(initial);
    setPolicyDirty(false);
    policyDirtyRef.current = false;
    setPolicySaveOk(false);
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const scrollY = window.scrollY;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || policySavingRef.current) return;
      if (policyDirtyRef.current) {
        setPolicyDiscardOpen(true);
        return;
      }
      p.setLegalDocModal(null);
    };
    window.addEventListener('keydown', onKey);
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/close only
  }, [p.legalDocModal]);

  const [verificationProfile, setVerificationProfile] = useState<SupplierProfileRow | null>(null);
  useEffect(() => {
    if (!p.user?.id) return;
    void fetchSupplierProfile(p.user.id).then((next) => {
      if (next) setVerificationProfile(next);
    });
  }, [p.user?.id, p.verificationStatus, p.payoutVerificationStatus]);
  const verification = supplierVerificationState(verificationProfile);

  const tabClass = (active: boolean) =>
    `lux-flat relative px-3.5 py-2.5 text-sm font-medium transition-colors ${
      active ? 'text-finland' : 'text-ink-muted hover:text-ink'
    }`;

  const requestClosePolicyEditor = () => {
    if (policySavingRef.current) return;
    if (policyDirty) {
      setPolicyDiscardOpen(true);
      return;
    }
    p.setLegalDocModal(null);
  };

  useEffect(() => {
    if (!policyToast) return;
    const timer = window.setTimeout(() => setPolicyToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [policyToast]);

  const discardPolicyEditor = () => {
    setPolicyDiscardOpen(false);
    setPolicyDirty(false);
    policyDirtyRef.current = false;
    p.setLegalDocModal(null);
  };

  const insertPolicyTemplate = () => {
    if (policyDraft.trim()) {
      setPolicyConfirmTemplate(true);
      return;
    }
    applyPolicyTemplate();
  };

  const applyPolicyTemplate = () => {
    const address = formatSupplierBusinessAddressFromParts({
      address_street: p.addressStreet,
      address_postal_code: p.addressPostalCode,
      address_city: p.addressCity,
      address_country: p.addressCountry,
    });
    const raw = applyLegalDate(
      p.legalDocModal === 'privacy' ? defaultPrivacyPolicyTemplate() : defaultTermsConditionsTemplate()
    );
    const next = applyLegalPlaceholders(raw, {
      operatorName: p.operatorDisplayName,
      businessAddress: address,
    });
    setPolicyDraft(next);
    setPolicyDirty(true);
    policyDirtyRef.current = true;
    setPolicyConfirmTemplate(false);
    setPolicySaveOk(false);
  };

  const savePolicyFromEditor = async () => {
    if (!p.user?.id || !p.legalDocModal || !canEditProfile || policySavingRef.current) return;
    const kind = p.legalDocModal;
    const saved = policyDraft.trim();
    policySavingRef.current = true;
    setPolicySaving(true);
    setPolicySaveError(null);
    setPolicySaveOk(false);
    const key = kind === 'privacy' ? 'privacy_policy_text' : 'terms_conditions_text';
    const res = await patchSupplierProfile(p.user.id, { [key]: saved || null });
    policySavingRef.current = false;
    setPolicySaving(false);
    if (!res.success) {
      setPolicySaveError(userFacingError(res.error ?? 'Could not save.', USER_ERROR.generic));
      return;
    }
    if (kind === 'privacy') p.setPrivacyPolicyText(saved);
    else p.setTermsConditionsText(saved);
    setPolicyDirty(false);
    policyDirtyRef.current = false;
    p.setLegalDocModal(null);
    setPolicyToast(kind === 'privacy' ? 'Privacy policy saved' : 'Terms & conditions saved');
  };

  const insuranceHasData = Boolean(
    p.insuranceProvider.trim() ||
      p.insurancePolicyNumber.trim() ||
      p.insuranceCoverage.trim() ||
      p.insuranceStart ||
      p.insuranceEnd
  );

  const insuranceExpired =
    p.insuranceEnd && !Number.isNaN(Date.parse(p.insuranceEnd))
      ? Date.parse(p.insuranceEnd) < Date.now()
      : false;

  const startInsuranceEdit = () => {
    setInsuranceDraft({
      provider: p.insuranceProvider,
      policy: p.insurancePolicyNumber,
      coverage: p.insuranceCoverage,
      start: p.insuranceStart,
      end: p.insuranceEnd,
    });
    setInsuranceLocalError(null);
    setInsuranceEditing(true);
  };

  const saveInsurance = async () => {
    if (!p.user?.id || !canEditProfile) return;
    if (insuranceDraft.start && insuranceDraft.end && insuranceDraft.end < insuranceDraft.start) {
      setInsuranceLocalError('Coverage end date must be on or after the start date.');
      return;
    }
    p.setLegalSaving(true);
    p.setLegalMessage(null);
    setInsuranceLocalError(null);
    const res = await patchSupplierProfile(p.user.id, {
      insurance_provider: insuranceDraft.provider.trim() || null,
      insurance_policy_number: insuranceDraft.policy.trim() || null,
      insurance_coverage: insuranceDraft.coverage.trim() || null,
      insurance_start: insuranceDraft.start || null,
      insurance_end: insuranceDraft.end || null,
      privacy_policy_text: p.privacyPolicyText.trim() || null,
      terms_conditions_text: p.termsConditionsText.trim() || null,
    });
    p.setLegalSaving(false);
    if (!res.success) {
      p.setLegalMessage('error');
      setInsuranceLocalError(userFacingError(res.error ?? 'Could not save.', USER_ERROR.generic));
      return;
    }
    p.setInsuranceProvider(insuranceDraft.provider);
    p.setInsurancePolicyNumber(insuranceDraft.policy);
    p.setInsuranceCoverage(insuranceDraft.coverage);
    p.setInsuranceStart(insuranceDraft.start);
    p.setInsuranceEnd(insuranceDraft.end);
    p.setLegalMessage('success');
    setInsuranceEditing(false);
  };

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        sansTitle
        title="Business settings"
        description="Your business profile and verification status."
      >
        {verificationProfile ? <SupplierVerificationCard view={verification} variant="compact" /> : null}
        {!canEditProfile ? (
          <NoticeCallout title="View only" tone="info" className="mt-4">
            Your role can view business profile details but cannot change company or legal settings.
          </NoticeCallout>
        ) : null}
        <nav className="mt-5 flex gap-x-1 border-b border-black/[0.06]" aria-label="Business settings sections">
          {(
            [
              ['company', 'Company'],
              ['legal', 'Legal & documents'],
              ['team', 'Team'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tabClass(p.businessProfileTab === id)}
              onClick={() => {
                p.setBusinessProfileTab(id);
                window.location.hash = id === 'company' ? 'company' : id === 'legal' ? 'legal' : 'team';
              }}
            >
              {label}
              {p.businessProfileTab === id ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-finland" aria-hidden />
              ) : null}
            </button>
          ))}
        </nav>
      </SupplierPageHero>

      {p.businessProfileTab === 'company' && (
        <BusinessProfileSummary
          canEdit={canEditProfile}
          profileDisplayName={p.profileDisplayName}
          businessLogoUrl={p.businessLogoUrl}
          companyLegalName={p.companyLegalName}
          businessType={p.businessType}
          addressCountry={p.addressCountry}
          companyRegistrationNumber={p.companyRegistrationNumber}
          taxId={p.taxId}
          vatId={p.vatId}
          contactPhone={p.contactPhone}
          addressStreet={p.addressStreet}
          addressCity={p.addressCity}
          addressPostalCode={p.addressPostalCode}
          managingDirectors={p.managingDirectors}
          companyRegistrationPath={p.companyRegistrationPath}
          verificationStatus={p.verificationStatus}
          verificationSubmittedAt={p.verificationSubmittedAt}
          businessVerificationFeedback={p.businessVerificationFeedback}
          payoutIban={p.payoutIban}
          payoutBic={p.payoutBic}
          payoutVerificationStatus={p.payoutVerificationStatus}
          payoutVerificationSubmittedAt={p.payoutVerificationSubmittedAt}
          paymentCycle={p.paymentCycle ?? ''}
          payoutThreshold={p.payoutThreshold ?? ''}
          onSupport={() => p.handleNavigate('support')}
        />
      )}

      {p.businessProfileTab === 'legal' && (
        <div id="supplier-business-legal" className={`${BUSINESS_SETTINGS_CONTENT_CLASS} space-y-4`}>
          <ProfileCard
            title="Insurance"
            description="Optional. Saved for your records."
            actions={
              canEditProfile && !insuranceEditing ? (
                <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" onClick={startInsuranceEdit}>
                  {insuranceHasData ? 'Edit' : 'Add insurance'}
                </button>
              ) : null
            }
          >
            {!insuranceEditing ? (
              insuranceHasData ? (
                <InfoGrid>
                  <InfoRow label="Provider" value={p.insuranceProvider} />
                  <InfoRow label="Policy number" value={p.insurancePolicyNumber} />
                  <InfoRow label="Coverage" value={p.insuranceCoverage} />
                  <InfoRow
                    label="Coverage dates"
                    value={
                      p.insuranceStart || p.insuranceEnd
                        ? `${p.insuranceStart || '—'} → ${p.insuranceEnd || '—'}${insuranceExpired ? ' · Expired' : ''}`
                        : null
                    }
                  />
                </InfoGrid>
              ) : (
                <p className="text-[13px] text-ink-muted">No insurance details saved.</p>
              )
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">Provider</label>
                    <input
                      type="text"
                      value={insuranceDraft.provider}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, provider: e.target.value }))}
                      className={profileInputClass()}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">Policy number</label>
                    <input
                      type="text"
                      value={insuranceDraft.policy}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, policy: e.target.value }))}
                      className={profileInputClass()}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[13px] font-medium text-ink">Coverage summary</label>
                    <input
                      type="text"
                      value={insuranceDraft.coverage}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, coverage: e.target.value }))}
                      className={profileInputClass()}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">Start date</label>
                    <input
                      type="date"
                      value={insuranceDraft.start}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, start: e.target.value }))}
                      className={profileInputClass()}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">End date</label>
                    <input
                      type="date"
                      value={insuranceDraft.end}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, end: e.target.value }))}
                      className={profileInputClass()}
                    />
                  </div>
                </div>
                {insuranceLocalError ? (
                  <p className="text-[12px] text-red-700" role="alert">
                    {insuranceLocalError}
                  </p>
                ) : null}
                {p.legalMessage === 'success' ? (
                  <p className="text-[12px] font-medium text-emerald-800">Insurance saved.</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={p.legalSaving}
                    className="tv-btn-primary h-9 px-3 text-[13px] disabled:opacity-50"
                    onClick={() => void saveInsurance()}
                  >
                    {p.legalSaving ? 'Saving…' : 'Save insurance'}
                  </button>
                  <button
                    type="button"
                    className="tv-btn-ghost h-9 px-3 text-[13px]"
                    onClick={() => {
                      setInsuranceEditing(false);
                      setInsuranceLocalError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </ProfileCard>

          <ProfileCard title="Policies for travelers" description="Shown on listings and at booking. Edits do not change terms already agreed on confirmed bookings.">
            <PolicyDocRow
              title="Privacy Policy"
              description="How you handle traveler data."
              statusLabel={
                p.privacyPolicyText.trim()
                  ? `Saved · ${p.privacyPolicyText.trim().length.toLocaleString()} characters`
                  : 'Not saved'
              }
              preview={p.privacyPolicyText.trim() || null}
              editDisabled={!canEditProfile}
              editLabel="Edit"
              onEdit={() => p.setLegalDocModal('privacy')}
            />
            <PolicyDocRow
              title="Terms & Conditions"
              description="Booking contract terms guests agree to."
              statusLabel={
                p.termsConditionsText.trim()
                  ? `Saved · ${p.termsConditionsText.trim().length.toLocaleString()} characters`
                  : 'Not saved'
              }
              preview={p.termsConditionsText.trim() || null}
              editDisabled={!canEditProfile}
              editLabel="Edit"
              onEdit={() => p.setLegalDocModal('terms')}
            />
          </ProfileCard>

          <p className="text-[12px] leading-snug text-ink-faint">
            Policy text is not legal advice. Have counsel review before relying on it.{' '}
            <a href={PARTNER_SUPPORT_PATH} className="font-medium text-finland hover:underline">
              Support
            </a>
          </p>
        </div>
      )}

      {p.businessProfileTab === 'team' && (
        <div id="supplier-business-team" className={BUSINESS_SETTINGS_CONTENT_CLASS}>
          <SupplierTeamPanel
            brandName={p.profileDisplayName.trim() || p.companyLegalName.trim() || p.operatorDisplayName}
            accountEmail={p.user?.email ?? null}
          />
        </div>
      )}

      {p.legalDocModal ? (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center overflow-hidden sm:items-center sm:p-3">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            aria-label="Close editor"
            disabled={policySaving}
            onClick={requestClosePolicyEditor}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-editor-title"
            className="relative z-[71] flex h-dvh w-full max-h-dvh flex-col overflow-hidden bg-white shadow-xl ring-1 ring-black/[0.08] sm:h-[min(90dvh,880px)] sm:w-[min(94vw,1040px)] sm:max-h-[90dvh] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5 sm:py-3.5">
              <div className="min-w-0">
                <h3 id="policy-editor-title" className="truncate text-[16px] font-semibold tracking-tight text-ink">
                  {p.legalDocModal === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
                </h3>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {policyDirty ? 'Unsaved changes' : policySaveOk ? 'Saved' : 'Editing'}
                  {' · '}
                  {policyDraft.length.toLocaleString()} characters
                </p>
              </div>
              <button
                type="button"
                onClick={requestClosePolicyEditor}
                disabled={policySaving}
                className="lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-black/[0.04] hover:text-ink disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 sm:px-5">
              <textarea
                className="min-h-0 w-full flex-1 resize-none rounded-xl border border-black/[0.08] bg-[#fafbfc] px-4 py-3 text-[15px] leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-finland/30"
                value={policyDraft}
                readOnly={policySaving}
                onChange={(e) => {
                  setPolicyDraft(e.target.value);
                  setPolicyDirty(true);
                  policyDirtyRef.current = true;
                  setPolicyConfirmTemplate(false);
                  setPolicySaveOk(false);
                }}
                spellCheck
                autoFocus
              />
              <p className="mt-2 shrink-0 text-[12px] text-ink-faint">
                Not legal advice. Templates do not constitute published policy until you save.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] bg-white px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                {!policyConfirmTemplate ? (
                  <button
                    type="button"
                    className="tv-btn-ghost h-10 px-3 text-[13px] disabled:opacity-50"
                    disabled={policySaving}
                    onClick={insertPolicyTemplate}
                  >
                    Insert template
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12px] text-ink-muted">Replace current text with the template?</p>
                    <button
                      type="button"
                      className="tv-btn-secondary h-9 px-3 text-[12px]"
                      onClick={applyPolicyTemplate}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="tv-btn-ghost h-9 px-3 text-[12px]"
                      onClick={() => setPolicyConfirmTemplate(false)}
                    >
                      Keep mine
                    </button>
                  </div>
                )}
                {policySaveError ? (
                  <p className="text-[12px] text-red-700" role="alert">
                    {policySaveError}
                  </p>
                ) : null}
                {policySaveOk && !policyDirty ? (
                  <p className="text-[12px] font-medium text-emerald-800">Saved.</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="tv-btn-ghost h-10 px-4 text-[13px] disabled:opacity-50"
                  disabled={policySaving}
                  onClick={requestClosePolicyEditor}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={policySaving || !canEditProfile || (!policyDirty && !policySaveError)}
                  className="tv-btn-primary h-10 px-4 text-[13px] disabled:opacity-50"
                  onClick={() => void savePolicyFromEditor()}
                >
                  {policySaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {policyToast ? (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[13px] font-medium text-ink shadow-lg"
        >
          {policyToast}
        </p>
      ) : null}

      <PartnerConfirmModal
        open={policyDiscardOpen}
        title="Discard unsaved changes?"
        description="Your edits will be lost if you close without saving."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={discardPolicyEditor}
        onCancel={() => setPolicyDiscardOpen(false)}
      />
    </div>
  );
}
