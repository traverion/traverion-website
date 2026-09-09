import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  FileText,
  ImagePlus,
  Landmark,
  MapPin,
  Shield,
  Wallet,
  Mail,
  KeyRound,
  ChevronRight,
  X,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getVerificationDocumentDisplayLabel,
  openVerificationDocumentPreview,
  removeSupplierBusinessLogoFiles,
  removeSupplierVerificationDocumentFile,
  uploadSupplierBusinessLogo,
  uploadSupplierVerificationDocument,
  patchSupplierProfile,
  verificationDocumentBasename,
} from '../../data/supabase-supplier-profile';
import { formatSupplierBusinessAddressFromParts } from '../../lib/supplierAddress';
import {
  getSupplierBusinessProfileMissingReasons,
  partnerPayoutVerifiedStatusNote,
} from '../../lib/supplierOnboarding';
import {
  isSupplierBusinessIdentityLocked,
  isSupplierPayoutDetailsLocked,
  SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL,
} from '../../lib/supplierVerificationLocks';
import { supplierPortalPublicBaseUrl } from '../../lib/partnerHost';
import { PARTNER_EMAIL_VERIFIED_PATH } from '../../lib/partnerPortalPaths';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from './supplierUi';
import {
  PARTNER_BUSINESS_REVIEW_STATUS_NOTE,
  PARTNER_PAYOUT_REVIEW_STATUS_NOTE,
} from '../../lib/booking-confirmation-copy';

type BusinessProfileTab = 'company' | 'legal';

type Props = {
  /** Page: business profile */
  variant: 'business-profile' | 'account-settings';
  user: User | null;
  isSupabase: boolean;
  supabase: SupabaseClient | null;

  supplierEmail: string;
  supplierEmailVerified: boolean;
  verificationSending: boolean;
  verificationMessage: 'sent' | 'error' | null;
  setVerificationMessage: (v: 'sent' | 'error' | null) => void;
  setVerificationSending: (v: boolean) => void;

  handleNavigate: (s: string) => void;

  businessProfileTab: BusinessProfileTab;
  setBusinessProfileTab: (t: BusinessProfileTab) => void;

  payoutIban: string;
  setPayoutIban: (v: string) => void;
  payoutBic: string;
  setPayoutBic: (v: string) => void;
  payoutVerificationStatus: string;
  payoutVerificationSubmittedAt: string;
  setPayoutVerificationStatus: (v: string) => void;
  setPayoutVerificationSubmittedAt: (v: string) => void;
  businessVerificationFeedback: string;
  payoutVerificationFeedback: string;
  setBusinessVerificationFeedback: (v: string) => void;
  setPayoutVerificationFeedback: (v: string) => void;
  paymentCycle: 'monthly' | 'biweekly' | '';
  setPaymentCycle: (v: 'monthly' | 'biweekly' | '') => void;
  payoutThreshold: string;
  setPayoutThreshold: (v: string) => void;
  payoutSaving: boolean;
  payoutMessage: 'success' | 'error' | null;
  setPayoutSaving: (v: boolean) => void;
  setPayoutMessage: (v: 'success' | 'error' | null) => void;
  updateSupplierPayout: typeof import('../../data/supabase-supplier-profile').updateSupplierPayout;

  businessType: 'company' | 'individual' | '';
  setBusinessType: (v: 'company' | 'individual' | '') => void;
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
  /** Server snapshot of business_type for lock UI (see supplierVerificationLocks). */
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
  fillPrivacyTemplate: () => void;
  fillTermsTemplate: () => void;

  businessLogoUrl: string;
  setBusinessLogoUrl: (v: string) => void;

  companyRegistrationPath: string;
  setCompanyRegistrationPath: (v: string) => void;
  setVerificationStatus: (v: string) => void;
  /** Call after company details save succeeds so parent can refresh onboarding state from server. */
  onCompanyProfileSaved: () => void;
  /** Call after payout save succeeds. */
  onPayoutSaved: () => void;
};

export default function SupplierSettingsPages(props: Props) {
  if (props.variant === 'account-settings') {
    return <AccountSettingsPage {...props} />;
  }
  return <BusinessProfilePage {...props} />;
}

function profileInputClass(disabled?: boolean): string {
  return `tv-input ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;
}

function ProfileSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  icon: typeof Building2;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-ink tracking-tight">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted leading-relaxed">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SaveBar({
  saving,
  disabled,
  label,
  savingLabel,
  onClick,
  success,
  error,
  errorText,
}: {
  saving: boolean;
  disabled?: boolean;
  label: string;
  savingLabel: string;
  onClick: () => void;
  success?: boolean;
  error?: boolean;
  errorText?: string | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
      <p className="text-xs text-ink-muted max-w-md">
        Changes are saved only when you press the button. Traverion reviews submissions manually.
      </p>
      <div className="flex flex-col items-stretch sm:items-end gap-2 min-w-[12rem]">
        <button
          type="button"
          disabled={saving || disabled}
          onClick={onClick}
          className="tv-btn-primary disabled:opacity-50"
        >
          {saving ? savingLabel : label}
        </button>
        {success && <span className="text-xs text-emerald-800 font-medium">Saved successfully.</span>}
        {error && <span className="text-xs text-red-700 font-medium">Could not save. Try again.</span>}
        {errorText ? <span className="text-xs text-red-700">{errorText}</span> : null}
      </div>
    </div>
  );
}

function AccountSettingsPage(p: Props) {
  const email = p.supplierEmail.trim() || '—';

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Account"
        description="Sign-in email and password for this supplier portal."
      >
        <p className="mt-3 text-sm text-ink-muted">
          {p.supplierEmailVerified ? 'Email verified' : 'Email not verified'}
        </p>
      </SupplierPageHero>

      <button
        type="button"
        onClick={() => p.handleNavigate('business-profile')}
        className="lux-flat mb-10 flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="font-semibold text-ink">Business</p>
          <p className="mt-0.5 text-sm text-ink-muted">Company details, payouts, and legal documents</p>
        </div>
        <ChevronRight className="w-5 h-5 text-ink-faint shrink-0" aria-hidden />
      </button>

      <ProfileSection
        id="supplier-account-email"
        icon={Mail}
        title="Sign-in email"
        description="The address you use to log in. Contact support if you need to change it."
      >
        <div>
          <p className="font-semibold text-ink break-all">{email}</p>
          <p className="mt-1 text-sm text-ink-muted">Signed in as account owner for this supplier account.</p>
        </div>

        {p.supplierEmailVerified ? (
          <p className="text-sm text-ink-muted">Your email is verified. You can use the partner portal normally.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-amber-900 leading-relaxed">
              Verify your email before you can log in. Check your inbox and spam folder for the confirmation link.
            </p>
            {p.supplierEmail && p.isSupabase ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={p.verificationSending}
                  onClick={async () => {
                    if (!p.supabase || !p.supplierEmail) return;
                    p.setVerificationMessage(null);
                    p.setVerificationSending(true);
                    const { error } = await p.supabase.auth.resend({
                      type: 'signup',
                      email: p.supplierEmail.trim().toLowerCase(),
                      options: { emailRedirectTo: `${supplierPortalPublicBaseUrl()}${PARTNER_EMAIL_VERIFIED_PATH}` },
                    });
                    p.setVerificationSending(false);
                    p.setVerificationMessage(error ? 'error' : 'sent');
                  }}
                  className="tv-btn-secondary disabled:opacity-50"
                >
                  {p.verificationSending ? 'Sending…' : 'Resend verification email'}
                </button>
                {p.verificationMessage === 'sent' && (
                  <p className="text-xs text-emerald-800 font-medium">Verification email sent. Check inbox and spam.</p>
                )}
                {p.verificationMessage === 'error' && (
                  <p className="text-xs text-red-700 font-medium">Could not resend right now. Try again shortly.</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </ProfileSection>

      <ProfileSection
        id="supplier-account-security"
        icon={KeyRound}
        title="Password"
        description="Change your sign-in password. You will confirm your current password first."
      >
        <ul className="text-sm text-ink-muted space-y-1.5 list-disc list-inside">
          <li>Minimum 8 characters</li>
          <li>Must be different from your current password</li>
          <li>You stay signed in after a successful change</li>
        </ul>

        <button
          type="button"
          onClick={() => p.handleNavigate('change-password')}
          className="tv-btn-primary inline-flex items-center justify-center gap-2"
        >
          Change password
          <ChevronRight className="w-4 h-4" aria-hidden />
        </button>

        {!p.isSupabase && (
          <p className="text-sm text-amber-800">
            Supabase auth is not connected in this environment — password changes are unavailable.
          </p>
        )}
      </ProfileSection>
    </div>
  );
}

function BusinessProfilePage(p: Props) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const companyRegInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [companyRegUploading, setCompanyRegUploading] = useState(false);
  const [companyRegDisplayName, setCompanyRegDisplayName] = useState('');
  const [docError, setDocError] = useState<string | null>(null);
  const [companySaveError, setCompanySaveError] = useState<string | null>(null);
  const [payoutSaveError, setPayoutSaveError] = useState<string | null>(null);

  const businessLocked = isSupplierBusinessIdentityLocked(
    p.verificationStatus,
    p.verificationSubmittedAt,
    p.businessTypeAtLastFetch
  );
  const payoutLocked = isSupplierPayoutDetailsLocked(
    p.payoutVerificationStatus,
    p.payoutVerificationSubmittedAt
  );
  const identityFieldsDisabled = businessLocked;
  const payoutDestinationLocked = payoutLocked;

  const businessProfileMissingReasons = getSupplierBusinessProfileMissingReasons({
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
    if (!p.legalDocModal) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const scrollY = window.scrollY;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.setLegalDocModal(null);
    };
    window.addEventListener('keydown', onKey);
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [p.legalDocModal]);

  const vPay = p.payoutVerificationStatus.trim().toLowerCase();
  const businessChip = (): { label: string } => {
    if (vBus === 'verified') return { label: 'Business verified' };
    if (vBus === 'rejected') return { label: 'Business rejected' };
    if (businessInReviewQueue) return { label: 'Business in review' };
    if (draftBusinessComplete) return { label: 'Ready to submit' };
    return { label: 'Incomplete' };
  };
  const payoutChip = (): { label: string } | null => {
    if (!p.payoutIban.trim() || !p.payoutBic.trim()) return null;
    if (vPay === 'verified') return { label: 'Payout verified' };
    if (vPay === 'rejected') return { label: 'Payout rejected' };
    if ((p.payoutVerificationSubmittedAt ?? '').trim()) return { label: 'Payout in review' };
    return { label: 'Payout pending' };
  };
  const busChip = businessChip();
  const payChip = payoutChip();
  const displayName = p.companyLegalName.trim() || p.operatorDisplayName || 'Your business';

  const profileTabClass = (active: boolean) =>
    `lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium ${
      active ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-muted'
    }`;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title={displayName}
        description="Company details, payouts, and legal documents guests see when they book your tours."
      >
        <p className="mt-3 text-sm text-ink-muted">
          {busChip.label}
          {payChip ? ` · ${payChip.label}` : ''}
        </p>
        <nav className="mt-6 flex gap-1 rounded-full bg-black/[0.04] p-1 w-fit" aria-label="Business profile sections">
          <button
            type="button"
            className={profileTabClass(p.businessProfileTab === 'company')}
            onClick={() => {
              p.setBusinessProfileTab('company');
              window.location.hash = 'company';
            }}
          >
            Company & payouts
          </button>
          <button
            type="button"
            className={profileTabClass(p.businessProfileTab === 'legal')}
            onClick={() => {
              p.setBusinessProfileTab('legal');
              window.location.hash = 'legal';
            }}
          >
            Legal
          </button>
        </nav>
      </SupplierPageHero>

      {p.businessProfileTab === 'company' && (
        <div className="space-y-10">
          {businessLocked && (
            <div className="text-sm text-ink">
              <p className="font-medium">
                {p.verificationStatus.trim().toLowerCase() === 'verified'
                  ? 'Business registration is locked'
                  : 'Business profile under review'}
              </p>
              <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">
                {p.verificationStatus.trim().toLowerCase() === 'verified' ? (
                  <>
                    You cannot change your legal business information or registration proof here. Payout bank details are
                    managed separately below. You can still update your profile photo, payout frequency, and minimum payout
                    threshold. To change locked business details, email{' '}
                    <a
                      href={`mailto:${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}?subject=Supplier%20profile%20change%20request`}
                      className="font-medium text-finland hover:underline"
                    >
                      {SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}
                    </a>
                    .
                  </>
                ) : (
                  <>
                    You cannot edit business registration or verification documents while Traverion reviews your business
                    submission. You can still add or update payout bank details (IBAN/BIC) below, and you can change your
                    profile photo, payout frequency, and threshold. Questions?{' '}
                    <a href={`mailto:${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}`} className="font-medium text-finland hover:underline">
                      {SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          <ProfileSection
            id="supplier-business-company"
            icon={ImagePlus}
            title="Brand"
            description="Optional photo shown on your tour pages so guests recognize your business."
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-black/[0.04] overflow-hidden flex items-center justify-center flex-shrink-0">
                    {p.businessLogoUrl ? (
                      <img src={p.businessLogoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-10 h-10 text-ink-faint" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-col gap-2 min-w-0">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file || !p.user?.id || !p.isSupabase) return;
                        setLogoError(null);
                        setLogoUploading(true);
                        const { publicUrl, error: upErr } = await uploadSupplierBusinessLogo(p.user.id, file);
                        if (upErr || !publicUrl) {
                          setLogoUploading(false);
                          setLogoError(upErr ?? 'Upload failed.');
                          return;
                        }
                        const res = await patchSupplierProfile(p.user.id, { business_logo_url: publicUrl });
                        setLogoUploading(false);
                        if (res.success) p.setBusinessLogoUrl(publicUrl);
                        else setLogoError(res.error ?? 'Could not save photo URL.');
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                        className="tv-btn-secondary disabled:opacity-50"
                      >
                        <ImagePlus className="w-4 h-4" />
                        {logoUploading ? 'Uploading…' : p.businessLogoUrl ? 'Replace photo' : 'Upload photo'}
                      </button>
                      {p.businessLogoUrl ? (
                        <button
                          type="button"
                          disabled={logoUploading}
                          onClick={async () => {
                            if (!p.user?.id) return;
                            setLogoError(null);
                            setLogoUploading(true);
                            await removeSupplierBusinessLogoFiles(p.user.id);
                            const res = await patchSupplierProfile(p.user.id, { business_logo_url: null });
                            setLogoUploading(false);
                            if (res.success) p.setBusinessLogoUrl('');
                            else setLogoError(res.error ?? 'Could not remove photo.');
                          }}
                          className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                {logoError && <p className="text-xs text-red-600">{logoError}</p>}
              </div>
            </div>
          </ProfileSection>

          <ProfileSection
            icon={Landmark}
            title="Legal identity"
            description="Registered name and identifiers — must match your official documents."
          >
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Business type</label>
              <select
                value={p.businessType}
                disabled={identityFieldsDisabled}
                onChange={(e) => p.setBusinessType(e.target.value as 'company' | 'individual' | '')}
                className={profileInputClass(identityFieldsDisabled)}
              >
                  <option value="">Not set</option>
                  <option value="company">Registered company</option>
                  <option value="individual">Individual trader</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Registered business name (legal name)
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  Enter the name exactly as registered with authorities. Our team checks that it matches your
                  registration documents before your account can go live.
                </p>
                <input
                  type="text"
                  value={p.companyLegalName}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setCompanyLegalName(e.target.value)}
                  placeholder="As on your business / trade registration"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
              {p.businessType === 'company' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Registration number</label>
                    <p className="text-xs text-ink-muted mb-2">
                      Official number from your company register, exactly as shown on your registration certificate. We
                      match this to your uploaded proof. Formats differ by jurisdiction—enter yours exactly as printed,
                      including hyphens, spaces, or a country or tax prefix if your certificate shows one (e.g.{' '}
                      <span className="font-mono text-ink">12345678-9</span> or{' '}
                      <span className="font-mono text-ink">AB123456789</span>).
                    </p>
                    <input
                      type="text"
                      value={p.companyRegistrationNumber}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setCompanyRegistrationNumber(e.target.value)}
                      placeholder="As on your registration certificate"
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">Managing director</label>
                    <p className="text-xs text-ink-muted mb-2">One person named as managing director on your registration.</p>
                    <input
                      type="text"
                      value={p.managingDirectors}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setManagingDirectors(e.target.value)}
                      placeholder="Full name"
                      className={profileInputClass(identityFieldsDisabled)}
                    />
                  </div>
                </>
              )}
          </ProfileSection>

          <ProfileSection
            icon={MapPin}
            title="Registered address"
            description="Must match your registration certificate — mismatches may delay verification."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1.5">Street address</label>
                <input
                  type="text"
                  value={p.addressStreet}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setAddressStreet(e.target.value)}
                  placeholder="Street, number, unit"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">City</label>
                <input
                  type="text"
                  value={p.addressCity}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setAddressCity(e.target.value)}
                  placeholder="City"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">ZIP / postal code</label>
                <input
                  type="text"
                  value={p.addressPostalCode}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setAddressPostalCode(e.target.value)}
                  placeholder="Postal code"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1.5">Country</label>
                <input
                  type="text"
                  value={p.addressCountry}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setAddressCountry(e.target.value)}
                  placeholder="Country"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
            </div>
          </ProfileSection>

          {p.businessType === 'company' && (
            <ProfileSection icon={Landmark} title="Tax references" description="Optional — only if separate from your registration number.">
              <div className="space-y-4">
                  <p className="text-xs text-slate-700">
                    You do not need a separate “tax ID” for verification if your{' '}
                    <span className="font-medium text-slate-900">registration number</span> above is complete. Use the
                    fields below only if you want VAT or another tax reference stored for payouts or invoicing.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">VAT ID (optional)</label>
                      <p className="text-xs text-ink-muted mb-2">
                        If you are VAT-registered, enter your VAT number in the format your country uses.
                      </p>
                      <input
                        type="text"
                        value={p.vatId}
                        disabled={identityFieldsDisabled}
                        onChange={(e) => p.setVatId(e.target.value)}
                        placeholder="Leave blank if not VAT-registered"
                        className={profileInputClass(identityFieldsDisabled)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">Other tax ID (optional)</label>
                      <p className="text-xs text-ink-muted mb-2">
                        Only when your jurisdiction issues a tax identifier separate from the registration number above.
                      </p>
                      <input
                        type="text"
                        value={p.taxId}
                        disabled={identityFieldsDisabled}
                        onChange={(e) => p.setTaxId(e.target.value)}
                        placeholder="Optional"
                        className={profileInputClass(identityFieldsDisabled)}
                      />
                    </div>
                  </div>
              </div>
            </ProfileSection>
          )}

          {p.businessType === 'individual' && (
            <ProfileSection icon={Landmark} title="Tax & registration" description="Required for individual trader verification.">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Tax or registration number</label>
                <p className="text-xs text-ink-muted mb-2">
                  Your business or tax identifier exactly as it appears on your trade or tax registration documents.
                </p>
                <input
                  type="text"
                  value={p.taxId}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setTaxId(e.target.value)}
                  placeholder="As on your registration"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">VAT ID (optional)</label>
                <input
                  type="text"
                  value={p.vatId}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setVatId(e.target.value)}
                  placeholder="Leave blank if not VAT-registered"
                  className={profileInputClass(identityFieldsDisabled)}
                />
              </div>
            </ProfileSection>
          )}

          <ProfileSection
            icon={FileText}
            title="Verification documents"
            description="Upload proof of registration — stored securely and reviewed by Traverion."
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Business registration proof</label>
                  <p className="text-xs text-ink-muted mb-2">
                    {p.businessType === 'company'
                      ? 'Official extract or certificate showing your company name and registration number (PDF or clear photo).'
                      : 'Official proof of your business or sole trader registration, trade register extract, or equivalent (PDF or clear photo).'}
                  </p>
                  <input
                    ref={companyRegInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !p.user?.id || !p.isSupabase) return;
                      if (businessLocked) return;
                      setDocError(null);
                      setCompanyRegUploading(true);
                      const { path, error: upErr } = await uploadSupplierVerificationDocument(p.user.id, file);
                      if (upErr || !path) {
                        setCompanyRegUploading(false);
                        setDocError(upErr ?? 'Upload failed.');
                        return;
                      }
                      setCompanyRegDisplayName(file.name.trim() || verificationDocumentBasename(path));
                      const res = await patchSupplierProfile(p.user.id, {
                        company_registration_document_path: path,
                      });
                      setCompanyRegUploading(false);
                      if (res.success) {
                        p.setCompanyRegistrationPath(path);
                      } else setDocError(res.error ?? 'Could not save document.');
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={companyRegUploading || identityFieldsDisabled}
                      onClick={() => companyRegInputRef.current?.click()}
                      className="tv-btn-secondary disabled:opacity-50"
                    >
                      {companyRegUploading
                        ? 'Uploading…'
                        : p.companyRegistrationPath
                          ? 'Replace document'
                          : 'Upload registration'}
                    </button>
                    {p.companyRegistrationPath ? (
                      <>
                        <button
                          type="button"
                          className="text-sm text-finland hover:underline"
                          onClick={async () => {
                            setDocError(null);
                            const { error: viewErr } = await openVerificationDocumentPreview(
                              p.companyRegistrationPath
                            );
                            if (viewErr) setDocError(viewErr);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          disabled={companyRegUploading || identityFieldsDisabled}
                          className="text-sm text-red-600 hover:underline disabled:opacity-50"
                          onClick={async () => {
                            if (!p.user?.id || !p.companyRegistrationPath) return;
                            setDocError(null);
                            setCompanyRegUploading(true);
                            await removeSupplierVerificationDocumentFile(p.companyRegistrationPath);
                            const res = await patchSupplierProfile(p.user.id, {
                              company_registration_document_path: null,
                            });
                            setCompanyRegUploading(false);
                            if (res.success) {
                              p.setCompanyRegistrationPath('');
                              setCompanyRegDisplayName('');
                            } else setDocError(res.error ?? 'Could not remove file.');
                          }}
                        >
                          Remove
                        </button>
                      </>
                    ) : null}
                  </div>
                  {p.companyRegistrationPath && companyRegDisplayName ? (
                    <p
                      className="mt-2 text-xs text-ink-muted break-all"
                      title={companyRegDisplayName}
                    >
                      <span className="font-medium text-ink">Uploaded file: </span>
                      {companyRegDisplayName}
                    </p>
                  ) : null}
                </div>
              {docError && <p className="text-xs text-red-600">{docError}</p>}
            </div>
          </ProfileSection>

          <section className="space-y-3">
            <h2 className="font-display text-2xl text-ink tracking-tight">Verification</h2>
            {p.verificationStatus.trim().toLowerCase() === 'verified' && (
              <p className="text-sm text-ink-muted leading-relaxed">
                {p.payoutVerificationStatus.trim().toLowerCase() === 'verified'
                  ? 'Your business details are approved and your payout (IBAN/BIC) is verified. You can publish listings when your tours meet listing quality checks.'
                  : 'Your business details are approved. You still need Traverion to verify your payout (IBAN/BIC) before you can publish listings.'}
              </p>
            )}
            {p.verificationStatus.trim().toLowerCase() === 'rejected' && (
              <div className="space-y-2">
                <p className="text-sm text-red-800 leading-relaxed">
                  Business verification was not approved. Update your details and documents, then save again.
                </p>
                {p.businessVerificationFeedback.trim() ? (
                  <p className="text-sm text-red-900 whitespace-pre-wrap">
                    {p.businessVerificationFeedback.trim()}
                  </p>
                ) : null}
              </div>
            )}
            {vBus !== 'verified' && vBus !== 'rejected' && businessInReviewQueue && (
              <p className="text-sm text-ink-muted leading-relaxed">{PARTNER_BUSINESS_REVIEW_STATUS_NOTE}</p>
            )}
            {vBus !== 'verified' && vBus !== 'rejected' && !businessInReviewQueue && !draftBusinessComplete && (
              <div className="space-y-2">
                <p className="text-sm text-ink-muted">Complete the sections above, then save to submit for review.</p>
                <ul className="list-disc list-inside text-sm text-ink-muted space-y-1">
                  {businessProfileMissingReasons.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {vBus !== 'verified' && vBus !== 'rejected' && !businessInReviewQueue && draftBusinessComplete && (
              <p className="text-sm text-ink-muted leading-relaxed">
                Required fields look complete. Save company details to send them to Traverion for review.
              </p>
            )}
          </section>

          <SaveBar
            saving={p.companySaving}
            disabled={identityFieldsDisabled}
            label="Save company details"
            savingLabel="Saving…"
            success={p.companyMessage === 'success'}
            error={p.companyMessage === 'error'}
            errorText={companySaveError}
            onClick={async () => {
                      if (!p.user?.id) return;
                      if (businessLocked) {
                        setCompanySaveError(
                          `These business details are locked. Email ${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL} to request a change.`
                        );
                        return;
                      }
                      setCompanySaveError(null);
                      p.setCompanyMessage(null);
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
                        setCompanySaveError(
                          'Enter your tax or registration number exactly as it appears on your official documents.'
                        );
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
                        p.setBusinessVerificationFeedback('');
                        p.setCompanyMessage('success');
                        p.onCompanyProfileSaved();
              } else {
                p.setCompanyMessage('error');
              }
            }}
          />

          <ProfileSection
            id="supplier-business-payout"
            icon={Wallet}
            title="Payment & payouts"
            description="Bank transfer only (IBAN + BIC). Verified separately from your business profile — both required to publish listings."
          >
            {payoutLocked && (
              <div className="text-sm text-ink">
                  <p className="font-medium">
                    {p.payoutVerificationStatus.trim().toLowerCase() === 'verified'
                      ? 'Payout bank details are locked'
                      : 'Payout details under review'}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">
                    {p.payoutVerificationStatus.trim().toLowerCase() === 'verified' ? (
                      <>
                        You cannot change IBAN or BIC here. Business details are managed separately above. You can still
                        change payout frequency and minimum threshold. To change bank details, email{' '}
                        <a
                          href={`mailto:${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}?subject=Supplier%20payout%20change%20request`}
                          className="font-medium text-finland hover:underline"
                        >
                          {SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}
                        </a>
                        .
                      </>
                    ) : (
                      <>
                        IBAN and BIC cannot be edited while Traverion reviews your payout submission. You can still
                        update payout frequency and threshold.
                      </>
                    )}
                  </p>
                </div>
              )}
            <div>
              <p className="text-sm text-ink-muted mb-4">
                Enter the account that should receive payouts. Saving IBAN and BIC submits them for verification.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">IBAN</label>
                  <input
                    type="text"
                    value={p.payoutIban}
                    disabled={payoutDestinationLocked}
                    onChange={(e) => p.setPayoutIban(e.target.value)}
                    placeholder="International bank account number"
                    className={profileInputClass(payoutDestinationLocked)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">BIC / SWIFT</label>
                  <input
                    type="text"
                    value={p.payoutBic}
                    disabled={payoutDestinationLocked}
                    onChange={(e) => p.setPayoutBic(e.target.value)}
                    placeholder="Bank identifier"
                    className={profileInputClass(payoutDestinationLocked)}
                  />
                </div>
              </div>
            </div>

            {p.payoutIban.trim() && p.payoutBic.trim() && vPay === 'verified' && (
              <p className="text-sm text-ink-muted">{partnerPayoutVerifiedStatusNote(vBus === 'verified')}</p>
            )}
            {p.payoutIban.trim() && p.payoutBic.trim() && vPay === 'rejected' && (
              <div className="space-y-2">
                <p className="text-sm text-red-800">Update IBAN and BIC, then save again to resubmit.</p>
                {p.payoutVerificationFeedback.trim() ? (
                  <p className="text-sm text-red-900 whitespace-pre-wrap">{p.payoutVerificationFeedback.trim()}</p>
                ) : null}
              </div>
            )}
            {p.payoutIban.trim() &&
              p.payoutBic.trim() &&
              vPay !== 'verified' &&
              vPay !== 'rejected' &&
              (p.payoutVerificationSubmittedAt ?? '').trim() !== '' && (
                <p className="text-sm text-ink-muted">{PARTNER_PAYOUT_REVIEW_STATUS_NOTE}</p>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Payout frequency</label>
                <p className="text-xs text-ink-muted mb-2">How often we settle payouts once enabled.</p>
                <select
                  value={p.paymentCycle}
                  onChange={(e) => p.setPaymentCycle(e.target.value as 'monthly' | 'biweekly' | '')}
                  className={profileInputClass()}
                >
                  <option value="">Not set</option>
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Minimum payout threshold</label>
                <p className="text-xs text-ink-muted mb-2">Minimum balance before a payout is sent (e.g. 50).</p>
                <input
                  type="number"
                  min={0}
                  value={p.payoutThreshold}
                  onChange={(e) => p.setPayoutThreshold(e.target.value)}
                  placeholder="0"
                  className={profileInputClass()}
                />
              </div>
            </div>
          </ProfileSection>

          <SaveBar
            saving={p.payoutSaving}
            label="Save payout details"
            savingLabel="Saving…"
            success={p.payoutMessage === 'success'}
            error={p.payoutMessage === 'error'}
            errorText={payoutSaveError}
            onClick={async () => {
              if (!p.user?.id) return;
              setPayoutSaveError(null);
              p.setPayoutMessage(null);
              if (!payoutDestinationLocked) {
                if (!p.payoutIban.trim() || !p.payoutBic.trim()) {
                  setPayoutSaveError('Enter both IBAN and BIC before saving payout details.');
                  return;
                }
              }
              p.setPayoutSaving(true);
              const submittedNow = new Date().toISOString();
              const res = payoutDestinationLocked
                ? await p.updateSupplierPayout(p.user.id, {
                    payment_cycle: p.paymentCycle || null,
                    payout_threshold_min: p.payoutThreshold !== '' ? Number(p.payoutThreshold) : null,
                  })
                : await p.updateSupplierPayout(p.user.id, {
                    payout_method: 'bank',
                    payout_iban: p.payoutIban.trim() || null,
                    payout_bic: p.payoutBic.trim() || null,
                    payout_paypal_email: null,
                    payout_verification_status: 'pending',
                    payout_verification_submitted_at: submittedNow,
                    payout_verification_feedback: null,
                    payment_cycle: p.paymentCycle || null,
                    payout_threshold_min: p.payoutThreshold !== '' ? Number(p.payoutThreshold) : null,
                  });
              p.setPayoutSaving(false);
              if (res.success) {
                if (!payoutDestinationLocked) {
                  p.setPayoutVerificationStatus('pending');
                  p.setPayoutVerificationSubmittedAt(submittedNow);
                  p.setPayoutVerificationFeedback('');
                }
                p.setPayoutMessage('success');
                p.onPayoutSaved();
              } else {
                p.setPayoutMessage('error');
              }
            }}
          />
        </div>
      )}

      {p.businessProfileTab === 'legal' && (
        <div id="supplier-business-legal" className="space-y-10">
          <ProfileSection
            icon={Shield}
            title="Insurance"
            description="Optional liability or tour-operator insurance for your records and verification."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1.5">Policy number</label>
                <input
                  type="text"
                  value={p.insurancePolicyNumber}
                  onChange={(e) => p.setInsurancePolicyNumber(e.target.value)}
                  placeholder="Policy number"
                  className={profileInputClass()}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1.5">Coverage details</label>
                <input
                  type="text"
                  value={p.insuranceCoverage}
                  onChange={(e) => p.setInsuranceCoverage(e.target.value)}
                  placeholder="Coverage summary"
                  className={profileInputClass()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Start date</label>
                <input
                  type="date"
                  value={p.insuranceStart}
                  onChange={(e) => p.setInsuranceStart(e.target.value)}
                  className={profileInputClass()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">End date</label>
                <input
                  type="date"
                  value={p.insuranceEnd}
                  onChange={(e) => p.setInsuranceEnd(e.target.value)}
                  className={profileInputClass()}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1.5">Provider</label>
                <input
                  type="text"
                  value={p.insuranceProvider}
                  onChange={(e) => p.setInsuranceProvider(e.target.value)}
                  placeholder="Insurance company name"
                  className={profileInputClass()}
                />
              </div>
            </div>
          </ProfileSection>

          <ProfileSection
            icon={FileText}
            title="Privacy policy"
            description={`Shown on tour pages. Pre-filled for ${p.operatorDisplayName} — edit if needed.`}
          >
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => p.setLegalDocModal('privacy')}
                className="tv-btn-secondary"
              >
                Open editor
              </button>
              <button
                type="button"
                onClick={p.fillPrivacyTemplate}
                className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-finland hover:bg-finland/5"
              >
                Reset to template
              </button>
            </div>
            <p className="text-sm text-ink-muted line-clamp-4 whitespace-pre-wrap max-h-36 overflow-hidden">
              {p.privacyPolicyText || 'No text saved yet — open the editor or reset to template.'}
            </p>
          </ProfileSection>

          <ProfileSection
            icon={FileText}
            title="Terms & conditions"
            description={`Booking contract terms for ${p.operatorDisplayName}. Guests see these when they book.`}
          >
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => p.setLegalDocModal('terms')}
                className="tv-btn-secondary"
              >
                Open editor
              </button>
              <button
                type="button"
                onClick={p.fillTermsTemplate}
                className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-finland hover:bg-finland/5"
              >
                Reset to template
              </button>
            </div>
            <p className="text-sm text-ink-muted line-clamp-4 whitespace-pre-wrap max-h-36 overflow-hidden">
              {p.termsConditionsText || 'No text saved yet — open the editor or reset to template.'}
            </p>
          </ProfileSection>

          <SaveBar
            saving={p.legalSaving}
            label="Save legal & insurance"
            savingLabel="Saving…"
            success={p.legalMessage === 'success'}
            error={p.legalMessage === 'error'}
            onClick={async () => {
              if (!p.user?.id) return;
              p.setLegalSaving(true);
              p.setLegalMessage(null);
              const res = await patchSupplierProfile(p.user.id, {
                insurance_policy_number: p.insurancePolicyNumber.trim() || null,
                insurance_coverage: p.insuranceCoverage.trim() || null,
                insurance_start: p.insuranceStart || null,
                insurance_end: p.insuranceEnd || null,
                insurance_provider: p.insuranceProvider.trim() || null,
                privacy_policy_text: p.privacyPolicyText.trim() || null,
                terms_conditions_text: p.termsConditionsText.trim() || null,
              });
              p.setLegalSaving(false);
              p.setLegalMessage(res.success ? 'success' : 'error');
            }}
          />
        </div>
      )}

      {p.legalDocModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden overscroll-none">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-md supports-[backdrop-filter]:bg-slate-900/25"
            aria-label="Close editor"
            onClick={() => p.setLegalDocModal(null)}
          />
          <div className="relative z-[71] flex max-h-[90dvh] w-full max-w-5xl min-h-0 flex-col rounded-t-2xl bg-paper-raised shadow-xl ring-1 ring-black/[0.08] sm:max-h-[90vh] sm:rounded-2xl motion-safe:animate-slide-up sm:motion-safe:animate-none overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-5 py-4">
              <h3 className="font-display text-2xl text-ink tracking-tight truncate">
                {p.legalDocModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h3>
              <button
                type="button"
                onClick={() => p.setLegalDocModal(null)}
                className="lux-flat p-2 rounded-full text-ink-muted hover:text-ink shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <textarea
                className="tv-input min-h-[min(50vh,420px)] w-full resize-y font-mono text-sm leading-relaxed"
                value={p.legalDocModal === 'privacy' ? p.privacyPolicyText : p.termsConditionsText}
                onChange={(e) =>
                  p.legalDocModal === 'privacy'
                    ? p.setPrivacyPolicyText(e.target.value)
                    : p.setTermsConditionsText(e.target.value)
                }
              />
              <p className="mt-2 text-xs text-ink-faint">
                Not legal advice. Have counsel review before relying on this text.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-black/[0.06] px-4 py-3">
              <button
                type="button"
                onClick={() => (p.legalDocModal === 'privacy' ? p.fillPrivacyTemplate() : p.fillTermsTemplate())}
                className="tv-btn-ghost"
              >
                Insert template
              </button>
              <button
                type="button"
                onClick={() => p.setLegalDocModal(null)}
                className="tv-btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
