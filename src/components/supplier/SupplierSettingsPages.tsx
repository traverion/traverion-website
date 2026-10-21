import { Mail, KeyRound, ChevronRight } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PARTNER_EMAIL_VERIFIED_PATH } from '../../lib/partnerPortalPaths';
import { supplierPortalPublicBaseUrl } from '../../lib/partnerHost';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from './supplierUi';
import { PARTNER_VERIFICATION_EMAIL_REQUESTED } from '../../lib/booking-confirmation-copy';
import BusinessProfilePage, {
  type BusinessProfilePageProps,
  type BusinessProfileTab,
} from './BusinessProfilePage';
import { ProfileCard } from './businessProfileUi';

type Props = BusinessProfilePageProps & {
  variant: 'business-profile' | 'account-settings';
  supplierEmail: string;
  supplierEmailVerified: boolean;
  verificationSending: boolean;
  verificationMessage: 'sent' | 'error' | null;
  setVerificationMessage: (v: 'sent' | 'error' | null) => void;
  setVerificationSending: (v: boolean) => void;
  // Extra fields still managed by SupplierLayout for Income / other flows
  setPayoutIban: (v: string) => void;
  setPayoutBic: (v: string) => void;
  setPayoutVerificationStatus: (v: string) => void;
  setPayoutVerificationSubmittedAt: (v: string) => void;
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
  fillPrivacyTemplate: () => void;
  fillTermsTemplate: () => void;
  onPayoutSaved: () => void;
  user: User | null;
  isSupabase: boolean;
  supabase: SupabaseClient | null;
  businessProfileTab: BusinessProfileTab;
};

export default function SupplierSettingsPages(props: Props) {
  if (props.variant === 'account-settings') {
    return <AccountSettingsPage {...props} />;
  }
  return <BusinessProfilePage {...props} />;
}

function AccountSettingsPage(p: Props) {
  const email = p.supplierEmail.trim() || '—';

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} space-y-5 max-w-3xl`}>
      <SupplierPageHero
        title="Account"
        description="Personal sign-in for this workspace — separate from business identity."
      >
        <p className="mt-2 text-[13px] text-ink-muted">
          {p.supplierEmailVerified ? 'Email verified' : 'Email not verified'}
        </p>
      </SupplierPageHero>

      <button
        type="button"
        onClick={() => p.handleNavigate('business-profile')}
        className="partner-surface-panel partner-surface-panel--quiet lux-flat partner-row-interact flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-tight text-ink">Business settings</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">Company, legal documents, and team</p>
        </div>
        <ChevronRight className="h-4 w-4 text-ink-faint shrink-0" aria-hidden />
      </button>

      <ProfileCard id="supplier-account-email" title="Sign-in email" description="The address you use to log in.">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-finland/10 text-finland shrink-0">
            <Mail className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink break-all">{email}</p>
            {p.supplierEmailVerified ? (
              <p className="mt-1 text-[13px] text-ink-muted">Verified for this Partner account.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-[13px] text-amber-900 leading-relaxed">
                  Confirm your email so Traverion can reach you about this account.
                </p>
                {p.supplierEmail && p.isSupabase ? (
                  <>
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
                          options: {
                            emailRedirectTo: `${supplierPortalPublicBaseUrl()}${PARTNER_EMAIL_VERIFIED_PATH}`,
                          },
                        });
                        p.setVerificationSending(false);
                        p.setVerificationMessage(error ? 'error' : 'sent');
                      }}
                      className="tv-btn-secondary h-9 px-3 text-[13px] disabled:opacity-50"
                    >
                      {p.verificationSending ? 'Sending…' : 'Resend verification email'}
                    </button>
                    {p.verificationMessage === 'sent' ? (
                      <p className="text-[12px] text-emerald-800 font-medium">
                        {PARTNER_VERIFICATION_EMAIL_REQUESTED}
                      </p>
                    ) : null}
                    {p.verificationMessage === 'error' ? (
                      <p className="text-[12px] text-red-700 font-medium">Could not resend right now. Try again shortly.</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </ProfileCard>

      <ProfileCard
        id="supplier-account-security"
        title="Password"
        description="Change your sign-in password. You will confirm your current password first."
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-finland/10 text-finland shrink-0">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-3">
            <ul className="text-[13px] text-ink-muted space-y-1 list-disc list-inside">
              <li>Minimum 8 characters</li>
              <li>Must be different from your current password</li>
              <li>You stay signed in after a successful change</li>
            </ul>
            <button
              type="button"
              disabled={!p.isSupabase}
              onClick={() => p.handleNavigate('change-password')}
              className="tv-btn-primary h-10 px-4 text-[13px] inline-flex items-center gap-2 disabled:opacity-50"
            >
              Change password
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
            {!p.isSupabase ? (
              <p className="text-[13px] text-amber-800">
                Supabase auth is not connected in this environment — password changes are unavailable.
              </p>
            ) : null}
          </div>
        </div>
      </ProfileCard>
    </div>
  );
}
