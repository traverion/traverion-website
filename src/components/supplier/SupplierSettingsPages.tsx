import type { Dispatch, SetStateAction } from 'react';
import { FileText, Shield } from 'lucide-react';
import type { SupplierRole } from '../../lib/supplierTeamRoles';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

type BusinessProfileTab = 'company' | 'legal';

type Props = {
  /** Page: business profile */
  variant: 'business-profile' | 'account-settings';
  user: User | null;
  role: SupplierRole;
  isSupabase: boolean;
  supabase: SupabaseClient | null;

  supplierEmail: string;
  supplierEmailVerified: boolean;
  verificationSending: boolean;
  verificationMessage: 'sent' | 'error' | null;
  setVerificationMessage: (v: 'sent' | 'error' | null) => void;
  setVerificationSending: (v: boolean) => void;
  publicSiteBaseUrl: () => string;

  teamMembers: { id: string; label: string; role: SupplierRole; createdAt: string }[];
  teamLabel: string;
  setTeamLabel: (v: string) => void;
  teamMemberId: string;
  setTeamMemberId: (v: string) => void;
  teamRole: SupplierRole;
  setTeamRole: (v: SupplierRole) => void;
  setTeamMembers: Dispatch<
    SetStateAction<{ id: string; label: string; role: SupplierRole; createdAt: string }[]>
  >;
  canManageTeam: (role: SupplierRole) => boolean;
  removeSupplierTeamMember: (ownerId: string, memberId: string) => Promise<boolean>;
  upsertSupplierTeamMember: (
    ownerId: string,
    m: { id: string; label: string; role: SupplierRole }
  ) => Promise<boolean>;

  newPassword: string;
  setNewPassword: (v: string) => void;
  passwordSaving: boolean;
  passwordMessage: 'success' | 'error' | null;
  setPasswordMessage: (v: 'success' | 'error' | null) => void;
  setPasswordSaving: (v: boolean) => void;

  settingsListingsCount: number | null;
  handleNavigate: (s: string) => void;

  businessProfileTab: BusinessProfileTab;
  setBusinessProfileTab: (t: BusinessProfileTab) => void;

  payoutMethod: 'bank' | 'paypal' | 'none' | '';
  setPayoutMethod: (v: 'bank' | 'paypal' | 'none' | '') => void;
  payoutIban: string;
  setPayoutIban: (v: string) => void;
  payoutBic: string;
  setPayoutBic: (v: string) => void;
  payoutPaypalEmail: string;
  setPayoutPaypalEmail: (v: string) => void;
  paymentCycle: 'monthly' | 'biweekly' | '';
  setPaymentCycle: (v: 'monthly' | 'biweekly' | '') => void;
  payoutThreshold: string;
  setPayoutThreshold: (v: string) => void;
  payoutSaving: boolean;
  payoutMessage: 'success' | 'error' | null;
  setPayoutSaving: (v: boolean) => void;
  setPayoutMessage: (v: 'success' | 'error' | null) => void;
  updateSupplierPayout: typeof import('../../data/supabase-supplier-profile').updateSupplierPayout;
  canManageFinance: (role: SupplierRole) => boolean;

  businessType: 'company' | 'individual' | '';
  setBusinessType: (v: 'company' | 'individual' | '') => void;
  companyLegalName: string;
  setCompanyLegalName: (v: string) => void;
  companyRegistrationNumber: string;
  setCompanyRegistrationNumber: (v: string) => void;
  managingDirectors: string;
  setManagingDirectors: (v: string) => void;
  businessAddress: string;
  setBusinessAddress: (v: string) => void;
  taxId: string;
  setTaxId: (v: string) => void;
  vatId: string;
  setVatId: (v: string) => void;
  verificationStatus: string;
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
};

export default function SupplierSettingsPages(props: Props) {
  if (props.variant === 'account-settings') {
    return <AccountSettingsPage {...props} />;
  }
  return <BusinessProfilePage {...props} />;
}

function AccountSettingsPage(p: Props) {
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Account settings</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Sign-in, team access, and password. Business details and payouts live under{' '}
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
          Current role: <span className="font-medium text-gray-700">{p.role}</span>
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
                  options: { emailRedirectTo: `${p.publicSiteBaseUrl()}/supplier-log-in` },
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

      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Team & roles</h2>
        <p className="text-sm text-gray-600 mt-1.5 mb-5">
          Assign roles so colleagues can manage bookings, operations, or finance without sharing one login.
        </p>
        <div className="space-y-3 max-w-2xl">
          {p.teamMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.label}</p>
                <p className="text-xs text-gray-500 truncate">{m.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{m.role}</span>
                {p.canManageTeam(p.role) && m.id !== (p.user?.id ?? 'local-supplier') && (
                  <button
                    type="button"
                    onClick={async () => {
                      const currentUserId = p.user?.id ?? 'local-supplier';
                      const ok = await p.removeSupplierTeamMember(currentUserId, m.id);
                      if (ok) {
                        p.setTeamMembers((prev) => prev.filter((x) => x.id !== m.id));
                      }
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {p.canManageTeam(p.role) ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2 bg-gray-50/50">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-800">Add member</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={p.teamLabel}
                  onChange={(e) => p.setTeamLabel(e.target.value)}
                  placeholder="Display name"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="text"
                  value={p.teamMemberId}
                  onChange={(e) => p.setTeamMemberId(e.target.value)}
                  placeholder="User id or email"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <select
                  value={p.teamRole}
                  onChange={(e) => p.setTeamRole(e.target.value as SupplierRole)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="manager">manager</option>
                  <option value="ops">ops</option>
                  <option value="finance">finance</option>
                  <option value="viewer">viewer</option>
                </select>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const id = p.teamMemberId.trim();
                  if (!id) return;
                  const label = p.teamLabel.trim() || id;
                  const currentUserId = p.user?.id ?? 'local-supplier';
                  const ok = await p.upsertSupplierTeamMember(currentUserId, { id, label, role: p.teamRole });
                  if (ok) {
                    const next = [
                      ...p.teamMembers.filter((m) => m.id !== id),
                      { id, label, role: p.teamRole, createdAt: new Date().toISOString() },
                    ];
                    p.setTeamMembers(next);
                    p.setTeamLabel('');
                    p.setTeamMemberId('');
                    p.setTeamRole('viewer');
                  }
                }}
                className="px-3 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
              >
                Add member
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Only owners can manage team roles.</p>
          )}
        </div>
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
  const tabBtn = (active: boolean) =>
    `rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
      active ? 'bg-finland text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Business profile</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Company details, payouts, and legal documents guests see when they book your experiences.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        {(() => {
          const hasListing = (p.settingsListingsCount ?? 0) > 0;
          const hasPayout = !!p.payoutMethod && p.payoutMethod !== 'none';
          const hasCompany = !!p.companyLegalName.trim();
          const done = [hasListing, hasPayout, hasCompany].filter(Boolean).length;
          return (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Setup progress</h2>
                  <p className="text-sm text-gray-600 mt-1.5">Minimum steps for smooth onboarding.</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-finland">{done}/3</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <li
                  className={`rounded-lg border px-3 py-2 ${
                    hasListing
                      ? 'border-green-100 bg-green-50/40 text-gray-700'
                      : 'border-amber-100 bg-amber-50/40 text-gray-900'
                  }`}
                >
                  {hasListing ? 'Done' : 'Todo'} · Publish listing
                </li>
                <li
                  className={`rounded-lg border px-3 py-2 ${
                    hasPayout
                      ? 'border-green-100 bg-green-50/40 text-gray-700'
                      : 'border-amber-100 bg-amber-50/40 text-gray-900'
                  }`}
                >
                  {hasPayout ? 'Done' : 'Todo'} · Payout details
                </li>
                <li
                  className={`rounded-lg border px-3 py-2 ${
                    hasCompany
                      ? 'border-green-100 bg-green-50/40 text-gray-700'
                      : 'border-amber-100 bg-amber-50/40 text-gray-900'
                  }`}
                >
                  {hasCompany ? 'Done' : 'Todo'} · Business profile
                </li>
              </ul>
              {!hasListing && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => p.handleNavigate('listings')}
                    className="inline-flex items-center gap-1 text-sm font-medium text-finland hover:underline"
                  >
                    Go to listings
                  </button>
                </div>
              )}
            </>
          );
        })()}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business type</label>
                <select
                  value={p.businessType}
                  onChange={(e) => p.setBusinessType(e.target.value as 'company' | 'individual' | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Not set</option>
                  <option value="company">Registered company</option>
                  <option value="individual">Individual trader</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Legal name / Company name</label>
                <input
                  type="text"
                  value={p.companyLegalName}
                  onChange={(e) => p.setCompanyLegalName(e.target.value)}
                  placeholder="Legal or company name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                />
              </div>
              {p.businessType === 'company' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Registration number</label>
                    <input
                      type="text"
                      value={p.companyRegistrationNumber}
                      onChange={(e) => p.setCompanyRegistrationNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Managing directors</label>
                    <input
                      type="text"
                      value={p.managingDirectors}
                      onChange={(e) => p.setManagingDirectors(e.target.value)}
                      placeholder="Names"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business address</label>
                <textarea
                  value={p.businessAddress}
                  onChange={(e) => p.setBusinessAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID (TIN)</label>
                  <input
                    type="text"
                    value={p.taxId}
                    onChange={(e) => p.setTaxId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VAT ID (if registered)</label>
                  <input
                    type="text"
                    value={p.vatId}
                    onChange={(e) => p.setVatId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
              </div>
              {p.verificationStatus && (
                <p className="text-sm text-gray-600">
                  Verification status: <span className="font-medium">{p.verificationStatus}</span>
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={p.companySaving || !p.canManageFinance(p.role)}
                  onClick={async () => {
                    if (!p.user?.id) return;
                    p.setCompanySaving(true);
                    p.setCompanyMessage(null);
                    const res = await p.updateSupplierCompanyProfile(p.user.id, {
                      business_type: p.businessType || null,
                      company_legal_name: p.companyLegalName.trim() || null,
                      company_registration_number: p.companyRegistrationNumber.trim() || null,
                      managing_directors: p.managingDirectors.trim() || null,
                      business_address: p.businessAddress.trim() || null,
                      tax_id: p.taxId.trim() || null,
                      vat_id: p.vatId.trim() || null,
                    });
                    p.setCompanySaving(false);
                    p.setCompanyMessage(res.success ? 'success' : 'error');
                  }}
                  className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                >
                  {p.companySaving ? 'Saving…' : 'Save company details'}
                </button>
                {p.companyMessage === 'success' && <span className="text-sm text-green-600">Saved.</span>}
                {p.companyMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
              </div>
            </div>
          </div>

          <div id="supplier-business-payout" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-900">Payout method</h2>
            <p className="text-sm text-gray-600 mt-1.5 mb-5">
              How you’d like to receive payouts when they’re enabled. Stored securely for when payments are integrated.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  value={p.payoutMethod}
                  onChange={(e) => p.setPayoutMethod(e.target.value as 'bank' | 'paypal' | 'none' | '')}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Not set</option>
                  <option value="bank">Bank transfer (IBAN)</option>
                  <option value="paypal">PayPal</option>
                  <option value="none">None / later</option>
                </select>
              </div>
              {p.payoutMethod === 'bank' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                    <input
                      type="text"
                      value={p.payoutIban}
                      onChange={(e) => p.setPayoutIban(e.target.value)}
                      placeholder="e.g. FI12 3456 7890 1234 56"
                      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">BIC / SWIFT</label>
                    <input
                      type="text"
                      value={p.payoutBic}
                      onChange={(e) => p.setPayoutBic(e.target.value)}
                      placeholder="e.g. NDEAFIHH"
                      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                    />
                  </div>
                </>
              )}
              {p.payoutMethod === 'paypal' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PayPal email</label>
                  <input
                    type="email"
                    value={p.payoutPaypalEmail}
                    onChange={(e) => p.setPayoutPaypalEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment cycle</label>
                <select
                  value={p.paymentCycle}
                  onChange={(e) => p.setPaymentCycle(e.target.value as 'monthly' | 'biweekly' | '')}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
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
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={p.payoutSaving || !p.canManageFinance(p.role)}
                  onClick={async () => {
                    if (!p.user?.id) return;
                    p.setPayoutSaving(true);
                    p.setPayoutMessage(null);
                    const res = await p.updateSupplierPayout(p.user.id, {
                      payout_method: p.payoutMethod || null,
                      payout_iban: p.payoutMethod === 'bank' ? p.payoutIban.trim() || null : null,
                      payout_bic: p.payoutMethod === 'bank' ? p.payoutBic.trim() || null : null,
                      payout_paypal_email: p.payoutMethod === 'paypal' ? p.payoutPaypalEmail.trim() || null : null,
                      payment_cycle: p.paymentCycle || null,
                      payout_threshold_min: p.payoutThreshold !== '' ? Number(p.payoutThreshold) : null,
                    });
                    p.setPayoutSaving(false);
                    p.setPayoutMessage(res.success ? 'success' : 'error');
                  }}
                  className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                >
                  {p.payoutSaving ? 'Saving…' : 'Save payout details'}
                </button>
                {p.payoutMessage === 'success' && <span className="text-sm text-green-600">Saved.</span>}
                {p.payoutMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
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
              disabled={p.legalSaving || !p.canManageFinance(p.role)}
              onClick={async () => {
                if (!p.user?.id) return;
                p.setLegalSaving(true);
                p.setLegalMessage(null);
                const res = await p.updateSupplierCompanyProfile(p.user.id, {
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
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => p.setLegalDocModal(null)}
          />
          <div className="relative bg-white rounded-t-xl sm:rounded-xl shadow-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col z-[71]">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
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
            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                className="w-full min-h-[min(50vh,420px)] px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-gray-800 leading-relaxed focus:ring-2 focus:ring-finland"
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
            <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end bg-gray-50 rounded-b-xl">
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
