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
import StatusChip from '../StatusChip';
import {
  PARTNER_BUSINESS_READY_TO_SUBMIT_NOTE,
  PARTNER_BUSINESS_REVIEW_STATUS_NOTE,
} from '../../lib/booking-confirmation-copy';
import {
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
  partnerPayoutReviewState,
  partnerPayoutStatusChip,
} from '../../lib/partnerVerificationStatus';
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
  businessVerificationFeedback: string;
  businessType: 'company' | 'individual' | '';
  setBusinessType: (v: 'company' | 'individual' | '') => void;
  profileDisplayName: string;
  setProfileDisplayName: (v: string) => void;
  companyLegalName: string;
  setCompanyLegalName: (v: string) => void;
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

  const { role } = useSupplierRole();
  const canEditProfile = canManageBookings(role);
  const businessLocked = isSupplierBusinessIdentityLocked(
    p.verificationStatus,
    p.verificationSubmittedAt,
    p.businessTypeAtLastFetch
  );
  const identityFieldsDisabled = businessLocked || !canEditProfile;
  const brandLocked = businessLocked;

  const businessProfileMissingReasons = getSupplierBusinessProfileMissingReasons({
    display_name: p.profileDisplayName,
    company_legal_name: p.companyLegalName,
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
      if (e.key !== 'Escape') return;
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

  const businessReview = partnerBusinessReviewState({
    verificationStatus: p.verificationStatus,
    submittedAt: p.verificationSubmittedAt,
    draftComplete: draftBusinessComplete,
  });
  const payoutReview = partnerPayoutReviewState({
    verificationStatus: p.payoutVerificationStatus,
    submittedAt: p.payoutVerificationSubmittedAt,
    hasBankDetails: Boolean(p.payoutIban.trim() && p.payoutBic.trim()),
  });
  const busChip = partnerBusinessStatusChip(businessReview);
  const payChip = partnerPayoutStatusChip(payoutReview);

  const tabClass = (active: boolean) =>
    `lux-flat relative px-3.5 py-2.5 text-sm font-medium transition-colors ${
      active ? 'text-finland' : 'text-ink-muted hover:text-ink'
    }`;

  const requestClosePolicyEditor = () => {
    if (policyDirty) {
      setPolicyDiscardOpen(true);
      return;
    }
    p.setLegalDocModal(null);
  };

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
    if (!p.user?.id || !p.legalDocModal || !canEditProfile || policySaving) return;
    setPolicySaving(true);
    setPolicySaveError(null);
    setPolicySaveOk(false);
    const key = p.legalDocModal === 'privacy' ? 'privacy_policy_text' : 'terms_conditions_text';
    const value = policyDraft.trim() || null;
    const res = await patchSupplierProfile(p.user.id, { [key]: value });
    setPolicySaving(false);
    if (!res.success) {
      setPolicySaveError(userFacingError(res.error ?? 'Could not save.', USER_ERROR.generic));
      return;
    }
    if (p.legalDocModal === 'privacy') p.setPrivacyPolicyText(policyDraft);
    else p.setTermsConditionsText(policyDraft);
    setPolicyDirty(false);
    policyDirtyRef.current = false;
    setPolicySaveOk(true);
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
        description="Company identity, legal documents, and team access."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Verification status">
          <StatusChip tone={busChip.tone}>{busChip.label}</StatusChip>
          <StatusChip tone={payChip.tone}>{payChip.label}</StatusChip>
        </div>
        {!canEditProfile ? (
          <NoticeCallout tone="info" className="mt-4">
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
        <div className={`${BUSINESS_SETTINGS_CONTENT_CLASS} space-y-4`}>
          <ProfileCard id="supplier-business-company" title="Brand identity">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.04] ring-1 ring-black/[0.06]">
                {p.businessLogoUrl ? (
                  <img src={p.businessLogoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-7 w-7 text-ink-faint" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  {brandLocked ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[17px] font-semibold tracking-tight text-ink">
                          {p.profileDisplayName.trim() || '—'}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                          <Lock className="h-3 w-3" aria-hidden />
                          Verified
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                        Your verified business name.{' '}
                        <button
                          type="button"
                          className="font-medium text-finland hover:underline"
                          onClick={() => p.handleNavigate('support')}
                        >
                          Contact Support
                        </button>{' '}
                        to request a change.
                      </p>
                    </>
                  ) : (
                    <>
                      <label htmlFor="supplier-brand-display-name" className="mb-1 block text-[13px] font-medium text-ink">
                        Brand name
                      </label>
                      <input
                        id="supplier-brand-display-name"
                        type="text"
                        value={p.profileDisplayName}
                        disabled={!canEditProfile}
                        onChange={(e) => {
                          p.setProfileDisplayName(e.target.value);
                          setBrandSaveError(null);
                          setBrandSaveOk(false);
                        }}
                        placeholder="e.g. Royal Nordic"
                        className={profileInputClass(!canEditProfile)}
                        autoComplete="organization"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!canEditProfile || brandSaving}
                          className="tv-btn-secondary h-9 px-3 text-[13px] disabled:opacity-50"
                          onClick={async () => {
                            if (!p.user?.id || brandSaving) return;
                            const next = p.profileDisplayName.trim();
                            if (!next) {
                              setBrandSaveError('Enter your brand name.');
                              return;
                            }
                            setBrandSaving(true);
                            setBrandSaveError(null);
                            setBrandSaveOk(false);
                            const res = await patchSupplierProfile(p.user.id, { display_name: next });
                            setBrandSaving(false);
                            if (res.success) {
                              p.setProfileDisplayName(next);
                              setBrandSaveOk(true);
                            } else {
                              setBrandSaveError(
                                userFacingError(res.error ?? 'Could not save brand name.', USER_ERROR.generic)
                              );
                            }
                          }}
                        >
                          {brandSaving ? 'Saving…' : 'Save brand name'}
                        </button>
                        {brandSaveOk ? <p className="text-[12px] font-medium text-emerald-800">Saved.</p> : null}
                        {brandSaveError ? (
                          <p className="text-[12px] text-red-700" role="alert">
                            {brandSaveError}
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !p.user?.id || !p.isSupabase || logoUploading) return;
                      setLogoError(null);
                      setLogoUploading(true);
                      const { publicUrl, error: upErr } = await uploadSupplierBusinessLogo(p.user.id, file);
                      if (upErr || !publicUrl) {
                        setLogoUploading(false);
                        setLogoError(userFacingError(upErr ?? 'Upload failed.', USER_ERROR.upload));
                        return;
                      }
                      const res = await patchSupplierProfile(p.user.id, { business_logo_url: publicUrl });
                      setLogoUploading(false);
                      if (res.success) p.setBusinessLogoUrl(publicUrl);
                      else setLogoError(userFacingError(res.error ?? 'Could not save logo.', USER_ERROR.upload));
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={logoUploading || !canEditProfile}
                      onClick={() => logoInputRef.current?.click()}
                      className="tv-btn-secondary inline-flex h-9 items-center gap-1.5 px-3 text-[13px] disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden />
                      {logoUploading ? 'Uploading…' : p.businessLogoUrl ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {p.businessLogoUrl ? (
                      <button
                        type="button"
                        disabled={logoUploading || !canEditProfile}
                        onClick={async () => {
                          if (!p.user?.id || logoUploading) return;
                          setLogoError(null);
                          setLogoUploading(true);
                          await removeSupplierBusinessLogoFiles(p.user.id);
                          const res = await patchSupplierProfile(p.user.id, { business_logo_url: null });
                          setLogoUploading(false);
                          if (res.success) p.setBusinessLogoUrl('');
                          else setLogoError(res.error ?? 'Could not remove logo.');
                        }}
                        className="h-9 rounded-lg px-3 text-[13px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove logo
                      </button>
                    ) : null}
                  </div>
                  {logoError ? (
                    <p className="mt-1.5 text-[12px] text-red-700" role="alert">
                      {logoError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-black/[0.05] pt-3">
              <label htmlFor="supplier-public-description" className="mb-1 block text-[13px] font-medium text-ink">
                Public business description
              </label>
              <textarea
                id="supplier-public-description"
                rows={3}
                maxLength={PUBLIC_DESCRIPTION_MAX}
                value={publicDescription}
                disabled={!canEditProfile}
                onChange={(e) => {
                  setPublicDescription(e.target.value.slice(0, PUBLIC_DESCRIPTION_MAX));
                  setDescSaveOk(false);
                  setDescSaveError(null);
                }}
                className={`${profileInputClass(!canEditProfile)} resize-y`}
                placeholder="Short introduction for travelers on your listing pages…"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="tabular-nums text-[12px] text-ink-faint">
                  {publicDescription.length}/{PUBLIC_DESCRIPTION_MAX}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {descSaveOk ? <p className="text-[12px] font-medium text-emerald-800">Saved.</p> : null}
                  {descSaveError ? (
                    <p className="text-[12px] text-red-700" role="alert">
                      {descSaveError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canEditProfile || descSaving}
                    className="tv-btn-secondary h-9 px-3 text-[13px] disabled:opacity-50"
                    onClick={async () => {
                      if (!p.user?.id || descSaving) return;
                      setDescSaving(true);
                      setDescSaveError(null);
                      setDescSaveOk(false);
                      const res = await patchSupplierProfile(p.user.id, {
                        public_description: publicDescription.trim() || null,
                      });
                      setDescSaving(false);
                      if (res.success) setDescSaveOk(true);
                      else setDescSaveError(userFacingError(res.error ?? 'Could not save.', USER_ERROR.generic));
                    }}
                  >
                    {descSaving ? 'Saving…' : 'Save description'}
                  </button>
                </div>
              </div>
            </div>
          </ProfileCard>

          <ProfileCard
            title="Registered business"
            description={
              businessLocked
                ? 'Verified details are locked. Contact Support to request changes.'
                : 'Must match your official registration documents.'
            }
          >
            <Subsection title="Legal identity">
              {businessLocked ? (
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
                  <InfoRow label="Registered business" value={p.companyLegalName} />
                  {p.businessType === 'company' ? (
                    <>
                      <InfoRow label="Registration number" value={p.companyRegistrationNumber} />
                      <InfoRow label="Managing director" value={p.managingDirectors} />
                    </>
                  ) : null}
                </InfoGrid>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <span id="settings-business-type-label" className="mb-1 block text-[13px] font-medium text-ink">
                      Business type
                    </span>
                    <PartnerSelect
                      aria-labelledby="settings-business-type-label"
                      value={p.businessType}
                      disabled={identityFieldsDisabled}
                      onChange={(v) => p.setBusinessType(v as 'company' | 'individual' | '')}
                      placeholder="Not set"
                      options={[
                        { value: '', label: 'Not set' },
                        { value: 'company', label: 'Registered company' },
                        { value: 'individual', label: 'Individual trader' },
                      ]}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[13px] font-medium text-ink">Registered business name</label>
                    <input
                      type="text"
                      value={p.companyLegalName}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setCompanyLegalName(e.target.value)}
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                  {p.businessType === 'company' ? (
                    <>
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-ink">Registration number</label>
                        <input
                          type="text"
                          value={p.companyRegistrationNumber}
                          disabled={identityFieldsDisabled}
                          onChange={(e) => p.setCompanyRegistrationNumber(e.target.value)}
                          className={profileInputClass(identityFieldsDisabled)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-ink">Managing director</label>
                        <input
                          type="text"
                          value={p.managingDirectors}
                          disabled={identityFieldsDisabled}
                          onChange={(e) => p.setManagingDirectors(e.target.value)}
                          className={profileInputClass(identityFieldsDisabled)}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </Subsection>

            <Subsection title="Registered address">
              {businessLocked ? (
                <InfoGrid>
                  <InfoRow label="Street" value={p.addressStreet} />
                  <InfoRow label="City" value={p.addressCity} />
                  <InfoRow label="Postal code" value={p.addressPostalCode} />
                  <InfoRow label="Country" value={p.addressCountry} />
                </InfoGrid>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[13px] font-medium text-ink">Street address</label>
                    <input
                      type="text"
                      value={p.addressStreet}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setAddressStreet(e.target.value)}
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">City</label>
                    <input
                      type="text"
                      value={p.addressCity}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setAddressCity(e.target.value)}
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">Postal code</label>
                    <input
                      type="text"
                      value={p.addressPostalCode}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setAddressPostalCode(e.target.value)}
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[13px] font-medium text-ink">Country</label>
                    <input
                      type="text"
                      value={p.addressCountry}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setAddressCountry(e.target.value)}
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                </div>
              )}
            </Subsection>

            <Subsection title="Tax information">
              {businessLocked ? (
                <InfoGrid>
                  {p.businessType === 'individual' ? (
                    <InfoRow label="Tax / registration number" value={p.taxId} />
                  ) : null}
                  <InfoRow label="VAT ID" value={p.vatId} />
                  {p.businessType === 'company' ? <InfoRow label="Other tax ID" value={p.taxId} /> : null}
                </InfoGrid>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {p.businessType === 'individual' ? (
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[13px] font-medium text-ink">Tax or registration number</label>
                      <input
                        type="text"
                        value={p.taxId}
                        disabled={identityFieldsDisabled}
                        onChange={(e) => p.setTaxId(e.target.value)}
                        className={profileInputClass(identityFieldsDisabled)}
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink">
                      VAT ID <span className="font-normal text-ink-faint">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={p.vatId}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setVatId(e.target.value)}
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                  {p.businessType === 'company' ? (
                    <div>
                      <label className="mb-1 block text-[13px] font-medium text-ink">
                        Other tax ID <span className="font-normal text-ink-faint">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={p.taxId}
                        disabled={identityFieldsDisabled}
                        onChange={(e) => p.setTaxId(e.target.value)}
                        className={profileInputClass(identityFieldsDisabled)}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </Subsection>
          </ProfileCard>

          <ProfileCard title="Verification documents">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">Business registration proof</p>
                <p className="mt-0.5 break-all text-[12px] text-ink-muted">
                  {p.companyRegistrationPath
                    ? companyRegDisplayName || 'Document on file'
                    : 'No document uploaded'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {vBus === 'rejected' || (!businessLocked && vBus !== 'verified') ? (
                  <StatusChip tone={busChip.tone}>{busChip.label}</StatusChip>
                ) : null}
                {p.companyRegistrationPath ? (
                  <button
                    type="button"
                    className="tv-btn-ghost h-9 px-3 text-[13px]"
                    onClick={async () => {
                      setDocError(null);
                      const { error: viewErr } = await openVerificationDocumentPreview(p.companyRegistrationPath);
                      if (viewErr) setDocError(viewErr);
                    }}
                  >
                    View document
                  </button>
                ) : null}
                {!businessLocked && canEditProfile ? (
                  <>
                    <input
                      ref={companyRegInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file || !p.user?.id || !p.isSupabase || companyRegUploading) return;
                        setDocError(null);
                        setCompanyRegUploading(true);
                        const previousPath = p.companyRegistrationPath?.trim() ?? '';
                        const { path, error: upErr } = await uploadSupplierVerificationDocument(p.user.id, file);
                        if (upErr || !path) {
                          setCompanyRegUploading(false);
                          setDocError(userFacingError(upErr ?? 'Upload failed.', USER_ERROR.verificationUpload));
                          return;
                        }
                        setCompanyRegDisplayName(file.name.trim() || verificationDocumentBasename(path));
                        const res = await patchSupplierProfile(p.user.id, {
                          company_registration_document_path: path,
                        });
                        setCompanyRegUploading(false);
                        if (res.success) {
                          p.setCompanyRegistrationPath(path);
                          if (previousPath && previousPath !== path) {
                            await removeSupplierVerificationDocumentFile(previousPath);
                          }
                        } else {
                          await removeSupplierVerificationDocumentFile(path);
                          setDocError(
                            userFacingError(res.error ?? 'Could not save document.', USER_ERROR.verificationUpload)
                          );
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={companyRegUploading}
                      onClick={() => companyRegInputRef.current?.click()}
                      className="tv-btn-secondary h-9 px-3 text-[13px] disabled:opacity-50"
                    >
                      {companyRegUploading
                        ? 'Uploading…'
                        : p.companyRegistrationPath
                          ? 'Replace document'
                          : 'Upload document'}
                    </button>
                  </>
                ) : businessLocked ? (
                  <button
                    type="button"
                    className="tv-btn-ghost h-9 px-3 text-[13px]"
                    onClick={() => p.handleNavigate('support')}
                  >
                    Request document change
                  </button>
                ) : null}
              </div>
            </div>
            {docError ? (
              <p className="text-[12px] text-red-700" role="alert">
                {docError}
              </p>
            ) : null}
          </ProfileCard>

          {vBus !== 'verified' ? (
            <ProfileCard title="Verification">
              {vBus === 'rejected' ? (
                <NoticeCallout title="Action required" tone="danger">
                  <p>Update your details and documents, then save again.</p>
                  {p.businessVerificationFeedback.trim() ? (
                    <p className="mt-2 whitespace-pre-wrap">{p.businessVerificationFeedback.trim()}</p>
                  ) : null}
                </NoticeCallout>
              ) : null}
              {vBus !== 'rejected' && businessInReviewQueue ? (
                <NoticeCallout title="Under review" tone="info">
                  {PARTNER_BUSINESS_REVIEW_STATUS_NOTE}
                </NoticeCallout>
              ) : null}
              {vBus !== 'rejected' && !businessInReviewQueue && !draftBusinessComplete ? (
                <NoticeCallout title="Action required" tone="warn">
                  <ul className="list-inside list-disc space-y-1">
                    {businessProfileMissingReasons.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </NoticeCallout>
              ) : null}
              {vBus !== 'rejected' && !businessInReviewQueue && draftBusinessComplete ? (
                <NoticeCallout title="Ready to submit" tone="info">
                  {PARTNER_BUSINESS_READY_TO_SUBMIT_NOTE}
                </NoticeCallout>
              ) : null}
            </ProfileCard>
          ) : null}

          <ProfileCard
            title="Payouts & banking"
            description="Company identity stays here. Complete payout verification and bank details in Income & Payouts → Settings."
            actions={
              <button
                type="button"
                className="tv-btn-secondary inline-flex h-9 items-center gap-1.5 px-3 text-[13px]"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=settings#business-payouts`)}
              >
                <Wallet className="h-4 w-4" aria-hidden />
                Open payout settings
              </button>
            }
          >
            <dl>
              <InfoRow label="Payout verification" value="Managed in Income → Settings" />
              <InfoRow label="Bank account" value={payChip.label} />
            </dl>
          </ProfileCard>

          {!businessLocked ? (
            <SaveBar
              saving={p.companySaving}
              disabled={!canEditProfile}
              label="Save & submit for review"
              savingLabel="Saving…"
              success={p.companyMessage === 'success'}
              error={p.companyMessage === 'error'}
              errorText={companySaveError}
              onClick={async () => {
                if (!p.user?.id) return;
                if (!canEditProfile) {
                  setCompanySaveError('Your role can view business details but cannot change them.');
                  return;
                }
                setCompanySaveError(null);
                p.setCompanyMessage(null);
                if (!p.profileDisplayName.trim()) {
                  setCompanySaveError('Enter your brand name.');
                  return;
                }
                if (!p.businessType) {
                  setCompanySaveError('Select whether you are a registered company or an individual trader.');
                  return;
                }
                if (!p.companyLegalName.trim()) {
                  setCompanySaveError('Enter your registered business name.');
                  return;
                }
                if (
                  !p.addressStreet.trim() ||
                  !p.addressCountry.trim() ||
                  !p.addressCity.trim() ||
                  !p.addressPostalCode.trim()
                ) {
                  setCompanySaveError('Enter your full address: street, country, city, and postal code.');
                  return;
                }
                if (p.businessType === 'company' && !p.companyRegistrationNumber.trim()) {
                  setCompanySaveError('Enter your company registration number.');
                  return;
                }
                if (p.businessType === 'individual' && !p.taxId.trim()) {
                  setCompanySaveError('Enter your tax or registration number.');
                  return;
                }
                if (!p.companyRegistrationPath?.trim()) {
                  setCompanySaveError('Upload your business registration proof before saving.');
                  return;
                }
                p.setCompanySaving(true);
                const combinedAddress = formatSupplierBusinessAddressFromParts({
                  address_street: p.addressStreet,
                  address_postal_code: p.addressPostalCode,
                  address_city: p.addressCity,
                  address_country: p.addressCountry,
                });
                const submittedNow = new Date().toISOString();
                const res = await p.updateSupplierCompanyProfile(p.user.id, {
                  business_type: p.businessType || null,
                  display_name: p.profileDisplayName.trim() || null,
                  company_legal_name: p.companyLegalName.trim() || null,
                  company_registration_number: p.companyRegistrationNumber.trim() || null,
                  managing_directors: p.managingDirectors.trim() || null,
                  address_street: p.addressStreet.trim() || null,
                  address_country: p.addressCountry.trim() || null,
                  address_city: p.addressCity.trim() || null,
                  address_postal_code: p.addressPostalCode.trim() || null,
                  business_address: combinedAddress.trim() || null,
                  tax_id: p.taxId.trim() || null,
                  vat_id: p.vatId.trim() || null,
                  verification_status: 'pending',
                  verification_submitted_at: submittedNow,
                  business_verification_feedback: null,
                });
                p.setCompanySaving(false);
                if (res.success) {
                  p.setVerificationStatus('pending');
                  p.setVerificationSubmittedAt(submittedNow);
                  p.setCompanyMessage('success');
                  p.onCompanyProfileSaved();
                  const ownerId = res.supplierId ?? p.user.id;
                  void notifySupplierEvent({
                    supplierId: ownerId,
                    eventType: 'verification_submitted',
                    portalBaseUrl: supplierPortalPublicBaseUrl(),
                    idempotencyKey: `supplier:verification_submitted:${ownerId}:${submittedNow.slice(0, 16)}`,
                  });
                } else {
                  p.setCompanyMessage('error');
                  setCompanySaveError(
                    userFacingError(res.error ?? 'Could not save company details.', USER_ERROR.generic)
                  );
                }
              }}
            />
          ) : null}
        </div>
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
                className="lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 sm:px-5">
              <textarea
                className="min-h-0 w-full flex-1 resize-none rounded-xl border border-black/[0.08] bg-[#fafbfc] px-4 py-3 text-[15px] leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-finland/30"
                value={policyDraft}
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
                    className="tv-btn-ghost h-10 px-3 text-[13px]"
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
                  className="tv-btn-ghost h-10 px-4 text-[13px]"
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
