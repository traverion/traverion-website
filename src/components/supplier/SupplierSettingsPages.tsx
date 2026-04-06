import { useEffect, useRef, useState } from 'react';
import { Building2, FileText, ImagePlus, Shield } from 'lucide-react';
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
import { getSupplierBusinessProfileMissingReasons } from '../../lib/supplierOnboarding';
import {
  isSupplierBusinessIdentityLocked,
  isSupplierPayoutDetailsLocked,
  SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL,
} from '../../lib/supplierVerificationLocks';
import { supplierPortalPublicBaseUrl } from '../../lib/partnerHost';
import { PARTNER_EMAIL_VERIFIED_PATH } from '../../lib/partnerPortalPaths';

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

  newPassword: string;
  setNewPassword: (v: string) => void;
  passwordSaving: boolean;
  passwordMessage: 'success' | 'error' | null;
  setPasswordMessage: (v: 'success' | 'error' | null) => void;
  setPasswordSaving: (v: boolean) => void;

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

function AccountSettingsPage(p: Props) {
  return (
    <div className="space-y-5 max-w-4xl w-full min-w-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Account settings</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Sign-in and password. Business details and payouts live under{' '}
          <span className="font-medium text-gray-800">Business profile</span>.
        </p>
      </div>

      <div
        id="supplier-account-email"
        className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm"
      >
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Account</h2>
        <p className="text-sm text-gray-600 mt-1.5 mb-5">Sign-in email and verification status.</p>
        <p className="text-gray-900 font-medium">{p.supplierEmail || '—'}</p>
        <p className="mt-1 text-xs text-gray-500">
          You are signed in as the <span className="font-medium text-gray-700">account owner</span> for this supplier
          account.
        </p>
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            p.supplierEmailVerified
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {p.supplierEmailVerified
            ? 'Email verification: Verified'
            : 'Email verification: Not verified. Verify your email before you can log in.'}
        </div>
        {!p.supplierEmailVerified && p.supplierEmail && p.isSupabase && (
          <div className="mt-2">
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
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {p.verificationSending ? 'Sending verification…' : 'Resend verification email'}
            </button>
            {p.verificationMessage === 'sent' && (
              <p className="mt-2 text-xs text-green-700">Verification email sent. Check inbox/spam.</p>
            )}
            {p.verificationMessage === 'error' && (
              <p className="mt-2 text-xs text-red-600">Could not resend right now. Try again shortly.</p>
            )}
          </div>
        )}
      </div>

      <div id="supplier-account-security" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Security & password</h2>
        <p className="text-sm text-gray-600 mt-1.5 mb-5">Update your supplier account password.</p>
        <div className="space-y-3 max-w-md">
          <input
            type="password"
            value={p.newPassword}
            onChange={(e) => p.setNewPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={p.passwordSaving || p.newPassword.trim().length < 8}
              onClick={async () => {
                if (!p.isSupabase || !p.supabase) {
                  p.setPasswordMessage('error');
                  return;
                }
                p.setPasswordSaving(true);
                p.setPasswordMessage(null);
                const { error } = await p.supabase.auth.updateUser({ password: p.newPassword.trim() });
                p.setPasswordSaving(false);
                if (error) {
                  p.setPasswordMessage('error');
                  return;
                }
                p.setNewPassword('');
                p.setPasswordMessage('success');
              }}
              className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
            >
              {p.passwordSaving ? 'Saving…' : 'Update password'}
            </button>
            {!p.isSupabase && (
              <span className="text-xs text-amber-700">Enable Supabase auth to update password.</span>
            )}
            {p.passwordMessage === 'success' && <span className="text-sm text-green-600">Password updated.</span>}
            {p.passwordMessage === 'error' && (
              <span className="text-sm text-red-600">Could not update password.</span>
            )}
          </div>
        </div>
      </div>
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
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
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

  const tabBtn = (active: boolean) =>
    `touch-manipulation rounded-xl px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 text-sm font-semibold transition-colors active:scale-[0.99] ${
      active ? 'bg-finland text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="space-y-5 max-w-4xl w-full min-w-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Business profile</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Company details, payouts, and legal documents guests see when they book your experiences.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <div className="flex flex-wrap gap-1 p-1">
          <button
            type="button"
            className={tabBtn(p.businessProfileTab === 'company')}
            onClick={() => {
              p.setBusinessProfileTab('company');
              window.location.hash = 'company';
            }}
          >
            Company & payouts
          </button>
          <button
            type="button"
            className={tabBtn(p.businessProfileTab === 'legal')}
            onClick={() => {
              p.setBusinessProfileTab('legal');
              window.location.hash = 'legal';
            }}
          >
            Legal obligations
          </button>
        </div>
      </div>

      {p.businessProfileTab === 'company' && (
        <>
          <div id="supplier-business-company" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Company details</h2>
            <p className="text-sm text-gray-600 mt-1.5 mb-5">Verification and invoicing. Insurance and policies are under Legal obligations.</p>
            <div className="space-y-4 max-w-xl">
              {businessLocked && (
                <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                  <p className="font-medium text-slate-900">
                    {p.verificationStatus.trim().toLowerCase() === 'verified'
                      ? 'Business registration is locked'
                      : 'Business profile under review'}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
                    {p.verificationStatus.trim().toLowerCase() === 'verified' ? (
                      <>
                        You cannot change your legal business information or registration proof here. Payout bank
                        details are managed separately below. You can still update your profile photo, payout frequency,
                        and minimum payout threshold. To change locked business details, email{' '}
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
                        You cannot edit business registration or verification documents while Traverion reviews your
                        business submission. You can still add or update payout bank details (IBAN/BIC) below, and you
                        can change your profile photo, payout frequency, and threshold. Questions?{' '}
                        <a
                          href={`mailto:${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}`}
                          className="font-medium text-finland hover:underline"
                        >
                          {SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Business profile photo</label>
                <p className="text-xs text-gray-500 mb-3">
                  Optional. Shown on your tour pages next to your business name so guests recognize your brand.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-gray-200 bg-white overflow-hidden flex items-center justify-center flex-shrink-0 shadow-sm">
                    {p.businessLogoUrl ? (
                      <img src={p.businessLogoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-10 h-10 text-gray-300" aria-hidden />
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
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
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
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business type</label>
                <select
                  value={p.businessType}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setBusinessType(e.target.value as 'company' | 'individual' | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Not set</option>
                  <option value="company">Registered company</option>
                  <option value="individual">Individual trader</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registered business name (legal name)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Enter the name exactly as registered with authorities. Our team checks that it matches your
                  registration documents before your account can go live.
                </p>
                <input
                  type="text"
                  value={p.companyLegalName}
                  disabled={identityFieldsDisabled}
                  onChange={(e) => p.setCompanyLegalName(e.target.value)}
                  placeholder="As on your business / trade registration"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              {p.businessType === 'company' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Registration number</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Official number from your company register, exactly as shown on your registration certificate. We
                      match this to your uploaded proof. Formats differ by jurisdiction—enter yours exactly as printed,
                      including hyphens, spaces, or a country or tax prefix if your certificate shows one (e.g.{' '}
                      <span className="font-mono text-gray-700">12345678-9</span> or{' '}
                      <span className="font-mono text-gray-700">AB123456789</span>).
                    </p>
                    <input
                      type="text"
                      value={p.companyRegistrationNumber}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setCompanyRegistrationNumber(e.target.value)}
                      placeholder="As on your registration certificate"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Managing director</label>
                    <p className="text-xs text-gray-500 mb-2">One person named as managing director on your registration.</p>
                    <input
                      type="text"
                      value={p.managingDirectors}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setManagingDirectors(e.target.value)}
                      placeholder="Full name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              )}
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Enter the address exactly as on your registration certificate. We check it against your uploaded
                  document during review; if it does not match, we may return the profile as needing more information
                  (e.g. mismatching address).
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <p className="text-xs text-gray-500 mb-2">Street and building; as on your business registration.</p>
                  <input
                    type="text"
                    value={p.addressStreet}
                    disabled={identityFieldsDisabled}
                    onChange={(e) => p.setAddressStreet(e.target.value)}
                    placeholder="Street, number, unit"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={p.addressCountry}
                    disabled={identityFieldsDisabled}
                    onChange={(e) => p.setAddressCountry(e.target.value)}
                    placeholder="Country"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={p.addressCity}
                    disabled={identityFieldsDisabled}
                    onChange={(e) => p.setAddressCity(e.target.value)}
                    placeholder="City"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP / postal code</label>
                  <input
                    type="text"
                    value={p.addressPostalCode}
                    disabled={identityFieldsDisabled}
                    onChange={(e) => p.setAddressPostalCode(e.target.value)}
                    placeholder="Postal code"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              {p.businessType === 'company' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                  <p className="text-xs text-slate-700">
                    You do not need a separate “tax ID” for verification if your{' '}
                    <span className="font-medium text-slate-900">registration number</span> above is complete. Use the
                    fields below only if you want VAT or another tax reference stored for payouts or invoicing.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">VAT ID (optional)</label>
                      <p className="text-xs text-gray-500 mb-2">
                        If you are VAT-registered, enter your VAT number in the format your country uses.
                      </p>
                      <input
                        type="text"
                        value={p.vatId}
                        disabled={identityFieldsDisabled}
                        onChange={(e) => p.setVatId(e.target.value)}
                        placeholder="Leave blank if not VAT-registered"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Other tax ID (optional)</label>
                      <p className="text-xs text-gray-500 mb-2">
                        Only when your jurisdiction issues a tax identifier separate from the registration number above.
                      </p>
                      <input
                        type="text"
                        value={p.taxId}
                        disabled={identityFieldsDisabled}
                        onChange={(e) => p.setTaxId(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              )}
              {p.businessType === 'individual' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tax or registration number</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Required for verification: your business or tax identifier exactly as it appears on your trade or tax
                      registration documents, in the format used in your jurisdiction.
                    </p>
                    <input
                      type="text"
                      value={p.taxId}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setTaxId(e.target.value)}
                      placeholder="As on your registration"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">VAT ID (optional)</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Only if you are VAT-registered. Use the format your tax authority issued.
                    </p>
                    <input
                      type="text"
                      value={p.vatId}
                      disabled={identityFieldsDisabled}
                      onChange={(e) => p.setVatId(e.target.value)}
                      placeholder="Leave blank if not VAT-registered"
                      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Verification documents</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Upload proof of your business or trade registration so Traverion can verify your account. Files are
                    stored securely and reviewed by our team.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business registration proof</label>
                  <p className="text-xs text-gray-500 mb-2">
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
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
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
                      className="mt-2 text-xs text-gray-600 break-all"
                      title={companyRegDisplayName}
                    >
                      <span className="font-medium text-gray-700">Uploaded file: </span>
                      {companyRegDisplayName}
                    </p>
                  ) : null}
                </div>
                {docError && <p className="text-xs text-red-600">{docError}</p>}
              </div>

              <div className="space-y-2">
                {p.verificationStatus.trim().toLowerCase() === 'verified' && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Business verification: <span className="font-semibold text-green-800">Verified</span>
                    </p>
                    <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                      {p.payoutVerificationStatus.trim().toLowerCase() === 'verified'
                        ? 'Your business details are approved and your payout (IBAN/BIC) is verified. You can publish listings when your tours meet listing quality checks.'
                        : 'Your business details are approved. You still need Traverion to verify your payout (IBAN/BIC) before you can publish listings; use Payment & payouts below.'}
                    </p>
                  </div>
                )}
                {p.verificationStatus.trim().toLowerCase() === 'rejected' && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Business verification: <span className="font-semibold text-red-800">Rejected</span>
                    </p>
                    <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                      Business verification was not approved. Update your details and documents here, then save again.
                      Your payout section stays independent—contact support if you need help.
                    </p>
                    {p.businessVerificationFeedback.trim() ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-950">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-800 mb-1">
                          Message from Traverion
                        </p>
                        <p className="text-sm text-red-900 whitespace-pre-wrap">{p.businessVerificationFeedback.trim()}</p>
                      </div>
                    ) : null}
                  </div>
                )}
                {vBus !== 'verified' && vBus !== 'rejected' && businessInReviewQueue && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Business verification:{' '}
                      <span className="font-semibold text-amber-900">Under verification</span>
                    </p>
                    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      Traverion is reviewing the business details and documents you submitted. You can still add or
                      update payout bank details below; each side is verified separately. We will email you when there
                      is an update.
                    </p>
                  </div>
                )}
                {vBus !== 'verified' && vBus !== 'rejected' && !businessInReviewQueue && !draftBusinessComplete && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Business verification: <span className="font-semibold text-slate-800">Incomplete</span>
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      <p className="text-xs text-slate-700">
                        Complete everything below, then use <span className="font-medium">Save company details</span> to
                        submit for review.
                      </p>
                      <p className="text-xs font-medium text-slate-900 mt-2">Still needed:</p>
                      <ul className="mt-1.5 list-disc list-inside text-xs text-slate-700 space-y-1">
                        {businessProfileMissingReasons.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {vBus !== 'verified' && vBus !== 'rejected' && !businessInReviewQueue && draftBusinessComplete && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Business verification: <span className="font-semibold text-sky-900">Ready to submit</span>
                    </p>
                    <p className="text-sm text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mt-2">
                      Required company fields and registration proof look complete. Click{' '}
                      <span className="font-medium">Save company details</span> below to send them to Traverion for
                      review. Until you save, you are not in the verification queue (for example after a reset in our
                      systems).
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    disabled={p.companySaving || identityFieldsDisabled}
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
                    className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    {p.companySaving ? 'Saving…' : 'Save company details'}
                  </button>
                  {p.companyMessage === 'success' && (
                    <span className="text-sm text-green-600">
                      Saved. Your business is now under verification by Traverion.
                    </span>
                  )}
                  {p.companyMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
                </div>
                {companySaveError && <p className="text-sm text-red-600">{companySaveError}</p>}
              </div>
            </div>
          </div>

          <div id="supplier-business-payout" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Payment &amp; payouts</h2>
            <p className="text-sm text-gray-600 mt-1.5 mb-5">
              Payouts are by bank transfer only (IBAN and BIC). Traverion verifies your bank details separately from your
              business profile. Both must be verified before you can publish listings. Payout frequency and threshold are
              optional.
            </p>
            <div className="space-y-4">
              {payoutLocked && (
                <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                  <p className="font-medium text-slate-900">
                    {p.payoutVerificationStatus.trim().toLowerCase() === 'verified'
                      ? 'Payout bank details are locked'
                      : 'Payout details under review'}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
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
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                <p className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">Bank transfer:</span> enter the account that should receive
                  payouts. Saving valid IBAN and BIC submits them for Traverion verification (independent of business
                  verification).
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                  <input
                    type="text"
                    value={p.payoutIban}
                    disabled={payoutDestinationLocked}
                    onChange={(e) => p.setPayoutIban(e.target.value)}
                    placeholder="International bank account number (IBAN)"
                    className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BIC / SWIFT</label>
                  <input
                    type="text"
                    value={p.payoutBic}
                    disabled={payoutDestinationLocked}
                    onChange={(e) => p.setPayoutBic(e.target.value)}
                    placeholder="Bank identifier (SWIFT/BIC)"
                    className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                {p.payoutIban.trim() && p.payoutBic.trim() && p.payoutVerificationStatus.trim().toLowerCase() === 'verified' && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Payout verification: <span className="font-semibold text-green-800">Verified</span>
                    </p>
                    <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                      Your bank details are approved. You still need business verification (above) before you can publish
                      listings.
                    </p>
                  </div>
                )}
                {p.payoutIban.trim() && p.payoutBic.trim() && p.payoutVerificationStatus.trim().toLowerCase() === 'rejected' && (
                  <div>
                    <p className="text-sm text-gray-700">
                      Payout verification: <span className="font-semibold text-red-800">Rejected</span>
                    </p>
                    <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                      Payout details were not approved. Update IBAN and BIC and save again to resubmit.
                    </p>
                    {p.payoutVerificationFeedback.trim() ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-950">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-800 mb-1">
                          Message from Traverion
                        </p>
                        <p className="text-sm text-red-900 whitespace-pre-wrap">{p.payoutVerificationFeedback.trim()}</p>
                      </div>
                    ) : null}
                  </div>
                )}
                {p.payoutIban.trim() &&
                  p.payoutBic.trim() &&
                  p.payoutVerificationStatus.trim().toLowerCase() !== 'verified' &&
                  p.payoutVerificationStatus.trim().toLowerCase() !== 'rejected' &&
                  (p.payoutVerificationSubmittedAt ?? '').trim() !== '' && (
                    <div>
                      <p className="text-sm text-gray-700">
                        Payout verification:{' '}
                        <span className="font-semibold text-amber-900">Under verification</span>
                      </p>
                      <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                        Traverion is reviewing your bank details. You can still work on business verification above if
                        needed. We will email you when there is an update.
                      </p>
                    </div>
                  )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payout frequency</label>
                <p className="text-xs text-gray-500 mb-1.5">How often we settle payouts once they are enabled.</p>
                <select
                  value={p.paymentCycle}
                  onChange={(e) => p.setPaymentCycle(e.target.value as 'monthly' | 'biweekly' | '')}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Not set</option>
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum payout threshold (e.g. 50)
                </label>
                <input
                  type="number"
                  min={0}
                  value={p.payoutThreshold}
                  onChange={(e) => p.setPayoutThreshold(e.target.value)}
                  placeholder="0"
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    disabled={p.payoutSaving}
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
                    className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    {p.payoutSaving ? 'Saving…' : 'Save payout details'}
                  </button>
                  {p.payoutMessage === 'success' && <span className="text-sm text-green-600">Saved.</span>}
                  {p.payoutMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
                </div>
                {payoutSaveError && <p className="text-sm text-red-600">{payoutSaveError}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {p.businessProfileTab === 'legal' && (
        <div id="supplier-business-legal" className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-finland" aria-hidden />
              Insurance
            </h2>
            <p className="text-sm text-gray-600 mt-1.5 mb-5">
              Optional liability or tour-operator insurance details for your records and verification.
            </p>
            <div className="space-y-2 max-w-xl">
              <input
                type="text"
                value={p.insurancePolicyNumber}
                onChange={(e) => p.setInsurancePolicyNumber(e.target.value)}
                placeholder="Policy number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
              />
              <input
                type="text"
                value={p.insuranceCoverage}
                onChange={(e) => p.setInsuranceCoverage(e.target.value)}
                placeholder="Coverage details"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={p.insuranceStart}
                  onChange={(e) => p.setInsuranceStart(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                />
                <input
                  type="date"
                  value={p.insuranceEnd}
                  onChange={(e) => p.setInsuranceEnd(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                />
              </div>
              <input
                type="text"
                value={p.insuranceProvider}
                onChange={(e) => p.setInsuranceProvider(e.target.value)}
                placeholder="Provider name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-finland" aria-hidden />
                  Privacy policy
                </h2>
                <p className="text-sm text-gray-600 mt-1.5 max-w-xl">
                  Shown to guests on your tour pages. We pre-fill a template with <strong>{p.operatorDisplayName}</strong> and your
                  address — edit if needed, then save.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => p.setLegalDocModal('privacy')}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  Open editor
                </button>
                <button type="button" onClick={p.fillPrivacyTemplate} className="text-sm font-medium text-finland hover:underline">
                  Reset to template
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500 line-clamp-4 whitespace-pre-wrap rounded-lg bg-gray-50 border border-gray-100 p-3 max-h-32 overflow-hidden">
              {p.privacyPolicyText || 'No text saved yet — open the editor or reset to template.'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-finland" aria-hidden />
                  Terms & conditions
                </h2>
                <p className="text-sm text-gray-600 mt-1.5 max-w-xl">
                  Contract terms for bookings with <strong>{p.operatorDisplayName}</strong>. Guests see these when they book.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => p.setLegalDocModal('terms')}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  Open editor
                </button>
                <button type="button" onClick={p.fillTermsTemplate} className="text-sm font-medium text-finland hover:underline">
                  Reset to template
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500 line-clamp-4 whitespace-pre-wrap rounded-lg bg-gray-50 border border-gray-100 p-3 max-h-32 overflow-hidden">
              {p.termsConditionsText || 'No text saved yet — open the editor or reset to template.'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={p.legalSaving}
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
              className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
            >
              {p.legalSaving ? 'Saving…' : 'Save legal & insurance'}
            </button>
            {p.legalMessage === 'success' && <span className="text-sm text-green-600">Saved.</span>}
            {p.legalMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
          </div>
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
          <div className="relative z-[71] flex max-h-[90dvh] w-full max-w-3xl min-h-0 flex-col rounded-t-xl border border-gray-200 bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {p.legalDocModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h3>
              <button
                type="button"
                onClick={() => p.setLegalDocModal(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <textarea
                className="min-h-[min(50vh,420px)] w-full resize-y rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm leading-relaxed text-gray-800 focus:ring-2 focus:ring-finland"
                value={p.legalDocModal === 'privacy' ? p.privacyPolicyText : p.termsConditionsText}
                onChange={(e) =>
                  p.legalDocModal === 'privacy'
                    ? p.setPrivacyPolicyText(e.target.value)
                    : p.setTermsConditionsText(e.target.value)
                }
              />
              <p className="mt-2 text-xs text-gray-500">
                Not legal advice. Have counsel review before relying on this text.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 rounded-b-xl border-t border-gray-200 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => (p.legalDocModal === 'privacy' ? p.fillPrivacyTemplate() : p.fillTermsTemplate())}
                className="px-3 py-2 text-sm font-medium text-finland hover:underline"
              >
                Insert template
              </button>
              <button
                type="button"
                onClick={() => p.setLegalDocModal(null)}
                className="px-4 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
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
