import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  MapPin,
  Calendar,
  CalendarDays,
  X,
  UserCircle2,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { supabase } from '../../lib/supabase';
import SupplierDashboard from '../../pages/supplier/SupplierDashboard';
import SupplierListings from '../../pages/supplier/SupplierListings';
import SupplierBookings from '../../pages/supplier/SupplierBookings';
import SupplierEarnings from '../../pages/supplier/SupplierEarnings';
import SupplierReviews from '../../pages/supplier/SupplierReviews';
import SupplierPickupPlanner from '../../pages/supplier/SupplierPickupPlanner';
import SupplierAvailability from '../../pages/supplier/SupplierAvailability';
import SupplierDiscountsOffers from '../../pages/supplier/SupplierDiscountsOffers';
import SupplierChangePassword from '../../pages/supplier/SupplierChangePassword';
import PartnerOnboarding from '../../pages/supplier/PartnerOnboarding';
import {
  authUserHasPartnerSignupMetadata,
  ensureSupplierProfile,
  ensureSupplierProfileFromAuthUser,
  fetchSupplierProfile,
  updateSupplierPayout,
  updateSupplierCompanyProfile,
} from '../../data/supabase-supplier-profile';
import {
  applyLegalPlaceholders,
  applyLegalDate,
  defaultPrivacyPolicyTemplate,
  defaultTermsConditionsTemplate,
} from '../../lib/supplierLegalTemplates';
import { formatSupplierBusinessAddressFromParts } from '../../lib/supplierAddress';
import { fetchMyListings } from '../../data/supabase-listings';
import SupplierLoginPage from './SupplierLoginPage';
import SupplierSettingsPages from './SupplierSettingsPages';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { isSupplierBusinessProfileComplete, isSupplierPayoutConfigured } from '../../lib/supplierOnboarding';
import { supplierOwnsAnyListing, userHasSupplierProfile } from '../../lib/supplierPortalAccess';
import { isPartnerMarketingPathForCurrentHost } from '../../lib/partnerHost';
import {
  PARTNER_APP_BASE,
  PARTNER_EMAIL_VERIFIED_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_RESET_PASSWORD_PATH,
  partnerMarketingPageFromPathname,
} from '../../lib/partnerPortalPaths';
import PartnerMarketingStaticPage from './PartnerMarketingStaticPage';
import PartnerEmailVerifiedPage from './PartnerEmailVerifiedPage';
import PartnerResetPasswordPage from './PartnerResetPasswordPage';
import { fetchConsumerProfile } from '../../data/supabase-consumer-profile';
import { partnerSignInTravelerOnlyEmailError } from '../../lib/customerSupplierAuthMessages';
import { setPartnerAuthFlash } from '../../lib/partnerAuthFlash';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';

type PartnerProfileGate =
  | { kind: 'pending'; forUserId: string }
  | { kind: 'resolved'; forUserId: string; allowed: boolean }
  | { kind: 'failed'; forUserId: string };

/** @deprecated Use PARTNER_LOGIN_PATH from partnerPortalPaths */
export const SUPPLIER_LOGIN_PATH = PARTNER_LOGIN_PATH;

type SupplierSection =
  | 'dashboard'
  | 'onboarding'
  | 'listings'
  | 'availability'
  | 'bookings'
  | 'earnings'
  | 'discounts'
  | 'reviews'
  | 'pickup'
  | 'business-profile'
  | 'account-settings'
  | 'change-password';
type AccountShortcutTarget = 'company' | 'legal' | 'account' | 'security' | 'payout';
type BusinessProfileTab = 'company' | 'legal';

const PRIMARY_NAV: { id: SupplierSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'availability', label: 'Calendar', icon: CalendarDays },
  { id: 'listings', label: 'Tours', icon: MapPin },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
];

const PATH_ALIASES: Record<string, SupplierSection> = {
  today: 'dashboard',
  tours: 'listings',
  calendar: 'availability',
  money: 'earnings',
  listings: 'listings',
  availability: 'availability',
  bookings: 'bookings',
  earnings: 'earnings',
  discounts: 'discounts',
  reviews: 'reviews',
  pickup: 'pickup',
  'business-profile': 'business-profile',
  'account-settings': 'account-settings',
  'change-password': 'change-password',
  onboarding: 'onboarding',
  dashboard: 'dashboard',
};

function pathForSection(s: SupplierSection): string {
  if (s === 'dashboard') return PARTNER_APP_BASE;
  if (s === 'listings') return `${PARTNER_APP_BASE}/tours`;
  if (s === 'availability') return `${PARTNER_APP_BASE}/calendar`;
  if (s === 'earnings') return `${PARTNER_APP_BASE}/money`;
  return `${PARTNER_APP_BASE}/${s}`;
}

const ROUTABLE_SECTIONS = Object.values(PATH_ALIASES) as SupplierSection[];
type ExtraSupplierSection = SupplierSection;

function getSectionFromPath(pathname: string): SupplierSection | null {
  const base = PARTNER_APP_BASE;
  if (pathname === base || pathname === `${base}/`) return 'dashboard';
  const match = pathname.match(new RegExp(`^${base}/([a-z-]+)`));
  if (!match) return null;
  if (match[1] === 'settings') return 'business-profile';
  const aliased = PATH_ALIASES[match[1]];
  if (aliased) return aliased;
  if (!ROUTABLE_SECTIONS.includes(match[1] as ExtraSupplierSection)) return 'dashboard';
  return match[1] as SupplierSection;
}

function isSupplierLoginPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '');
  return p === PARTNER_LOGIN_PATH;
}

function isPartnerResetPasswordPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  return p === PARTNER_RESET_PASSWORD_PATH;
}

function isSupplierPortalPath(pathname: string): boolean {
  return (
    pathname === PARTNER_APP_BASE ||
    pathname === `${PARTNER_APP_BASE}/` ||
    pathname.startsWith(`${PARTNER_APP_BASE}/`)
  );
}

export default function SupplierLayout() {
  const { user, loading, signOut, isSupabase } = useSupplierAuth();
  const [partnerProfileGate, setPartnerProfileGate] = useState<PartnerProfileGate | null>(null);
  const [partnerGateRetryKey, setPartnerGateRetryKey] = useState(0);
  const blockedRedirectStarted = useRef(false);
  const partnerGateEpochRef = useRef(0);
  const [section, setSection] = useState<SupplierSection>(() => getSectionFromPath(window.location.pathname) ?? 'dashboard');
  const [payoutIban, setPayoutIban] = useState('');
  const [payoutBic, setPayoutBic] = useState('');
  const [payoutVerificationStatus, setPayoutVerificationStatus] = useState('');
  const [payoutVerificationSubmittedAt, setPayoutVerificationSubmittedAt] = useState('');
  const [businessVerificationFeedback, setBusinessVerificationFeedback] = useState('');
  const [payoutVerificationFeedback, setPayoutVerificationFeedback] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<'success' | 'error' | null>(null);
  const [paymentCycle, setPaymentCycle] = useState<'monthly' | 'biweekly' | ''>('');
  const [payoutThreshold, setPayoutThreshold] = useState<string>('');
  const [businessType, setBusinessType] = useState<'company' | 'individual' | ''>('');
  /** Last server-backed business_type for verification lock (not in-progress dropdown edits). */
  const [businessTypeAtLastFetch, setBusinessTypeAtLastFetch] = useState<'company' | 'individual' | ''>('');
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState('');
  const [managingDirectors, setManagingDirectors] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCountry, setAddressCountry] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [taxId, setTaxId] = useState('');
  const [vatId, setVatId] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<string>('');
  const [verificationSubmittedAt, setVerificationSubmittedAt] = useState<string>('');
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('');
  const [insuranceCoverage, setInsuranceCoverage] = useState('');
  const [insuranceStart, setInsuranceStart] = useState('');
  const [insuranceEnd, setInsuranceEnd] = useState('');
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<'success' | 'error' | null>(null);
  const [onboardingListingCount, setOnboardingListingCount] = useState<number | null>(null);
  const [onboardingHasPayout, setOnboardingHasPayout] = useState(false);
  const [onboardingHasCompany, setOnboardingHasCompany] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<AccountShortcutTarget | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [businessProfileTab, setBusinessProfileTab] = useState<BusinessProfileTab>('company');
  const [privacyPolicyText, setPrivacyPolicyText] = useState('');
  const [termsConditionsText, setTermsConditionsText] = useState('');
  const [legalSaving, setLegalSaving] = useState(false);
  const [legalMessage, setLegalMessage] = useState<'success' | 'error' | null>(null);
  const [legalDocModal, setLegalDocModal] = useState<'privacy' | 'terms' | null>(null);
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<'sent' | 'error' | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string>('');
  const [companyRegistrationPath, setCompanyRegistrationPath] = useState('');
  const [pathEpoch, setPathEpoch] = useState(0);

  const supplierEmail = typeof user?.email === 'string' ? user.email : '';
  const supplierEmailVerified = Boolean((user as { email_confirmed_at?: string | null } | null)?.email_confirmed_at);

  /** Supabase may emit new `user` object references (e.g. auth refresh); gate only on stable id + retry. */
  const partnerGateUserRef = useRef(user);
  partnerGateUserRef.current = user;

  useEffect(() => {
    const client = supabase;
    if (!user?.id || !isSupabase || !client) {
      setPartnerProfileGate(null);
      return;
    }
    const uid = user.id;
    const epoch = ++partnerGateEpochRef.current;
    let cancelled = false;
    setPartnerProfileGate({ kind: 'pending', forUserId: uid });

    const stale = () => cancelled || epoch !== partnerGateEpochRef.current;

    /**
     * If `supplier_profiles` is missing, create it when we can prove partner intent:
     * - Fresh `getUser()` metadata (JWT/session can omit fields right after confirm), or
     * - Partner sign-up metadata on session user, or
     * - They already own listings as this supplier (RLS-safe).
     */
    const tryRepairPartnerProfileRow = async () => {
      if (stale()) return;
      const exists = await userHasSupplierProfile(client, uid);
      if (stale()) return;
      if (exists === true) return;

      const { data: freshAuth } = await client.auth.getUser();
      if (stale()) return;
      const fromServer = freshAuth.user;
      const sessionUser = partnerGateUserRef.current;
      const candidate = fromServer ?? sessionUser;
      if (!candidate) return;

      if (authUserHasPartnerSignupMetadata(candidate)) {
        const res = await ensureSupplierProfileFromAuthUser(candidate);
        if (!res.success && typeof console !== 'undefined') {
          console.warn('[Traverion partner] supplier_profiles repair (metadata) failed:', res.error);
        }
        return;
      }

      if (sessionUser && authUserHasPartnerSignupMetadata(sessionUser)) {
        const res = await ensureSupplierProfileFromAuthUser(sessionUser);
        if (!res.success && typeof console !== 'undefined') {
          console.warn('[Traverion partner] supplier_profiles repair (session metadata) failed:', res.error);
        }
        return;
      }

      const owns = await supplierOwnsAnyListing(client, uid);
      if (stale()) return;
      if (owns === true) {
        const email = typeof candidate.email === 'string' ? candidate.email : '';
        const local = email.includes('@') ? email.split('@')[0]! : email || 'Partner';
        const res = await ensureSupplierProfile(uid, { display_name: local });
        if (!res.success && typeof console !== 'undefined') {
          console.warn('[Traverion partner] supplier_profiles repair (listings) failed:', res.error);
        }
      }
    };

    const run = async () => {
      await tryRepairPartnerProfileRow();

      let falseStreak = 0;
      const maxPasses = 14;
      for (let attempt = 0; attempt < maxPasses && !stale(); attempt++) {
        const ok = await userHasSupplierProfile(client, uid);
        if (stale()) return;
        if (ok === true) {
          setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: true });
          return;
        }
        if (ok === false) {
          falseStreak += 1;
          // Avoid flashing traveler on one transient empty read (Strict Mode, cold JWT, etc.)
          if (falseStreak >= 2 && attempt >= 1) {
            await tryRepairPartnerProfileRow();
            const afterRepair = await userHasSupplierProfile(client, uid);
            if (stale()) return;
            if (afterRepair === true) {
              setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: true });
              return;
            }
            setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: false });
            return;
          }
        } else {
          falseStreak = 0;
        }
        await new Promise((r) => setTimeout(r, 100 + attempt * 45));
      }
      if (stale()) return;
      await tryRepairPartnerProfileRow();
      const last = await userHasSupplierProfile(client, uid);
      if (stale()) return;
      if (last === true) setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: true });
      else if (last === false) setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: false });
      else setPartnerProfileGate({ kind: 'failed', forUserId: uid });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isSupabase, partnerGateRetryKey]);

  const partnerGateView = (() => {
    if (!user?.id) return 'anon' as const;
    if (!partnerProfileGate || partnerProfileGate.forUserId !== user.id) return 'checking' as const;
    if (partnerProfileGate.kind === 'pending') return 'checking' as const;
    if (partnerProfileGate.kind === 'failed') return 'error' as const;
    return partnerProfileGate.allowed ? ('allowed' as const) : ('blocked' as const);
  })();

  useEffect(() => {
    if (!user?.id) blockedRedirectStarted.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (partnerGateView !== 'blocked' || !user?.id) return;
    if (blockedRedirectStarted.current) return;
    blockedRedirectStarted.current = true;

    const email = typeof user.email === 'string' ? user.email.trim() : '';
    const travelerSignInUrl = `${publicSiteBaseUrl()}/log-in`;

    void (async () => {
      let message = partnerSignInTravelerOnlyEmailError(travelerSignInUrl);
      try {
        const consumerRow = await fetchConsumerProfile(user.id);
        if (!consumerRow) {
          message =
            'No Traverion partner profile is linked to this account. Sign in with a partner email or register as a partner below.';
        }
      } catch {
        /* keep traveler-oriented default */
      }
      setPartnerAuthFlash({ message, email: email || undefined, tab: 'signin' });
      await signOut();
      window.location.replace(PARTNER_LOGIN_PATH);
    })();
  }, [partnerGateView, user?.id, user?.email, signOut]);

  useEffect(() => {
    if ((section !== 'business-profile' && section !== 'account-settings') || !user?.id || !isSupabase) return;
    fetchSupplierProfile(user.id).then((p) => {
      if (p) {
        setProfileDisplayName(p.display_name ?? '');
        setPayoutIban(p.payout_iban ?? '');
        setPayoutBic(p.payout_bic ?? '');
        setPayoutVerificationStatus((p.payout_verification_status ?? '').trim());
        setPayoutVerificationSubmittedAt(
          p.payout_verification_submitted_at ? String(p.payout_verification_submitted_at) : ''
        );
        setBusinessVerificationFeedback((p.business_verification_feedback ?? '').trim());
        setPayoutVerificationFeedback((p.payout_verification_feedback ?? '').trim());
        setPaymentCycle(p.payment_cycle ?? '');
        setPayoutThreshold(String(p.payout_threshold_min ?? ''));
        const bt = (p.business_type ?? '') as '' | 'company' | 'individual';
        setBusinessType(bt);
        setBusinessTypeAtLastFetch(bt);
        setCompanyLegalName(p.company_legal_name ?? '');
        setCompanyRegistrationNumber(p.company_registration_number ?? '');
        setManagingDirectors(p.managing_directors ?? '');
        const hasStructured =
          (p.address_street ?? '').trim() ||
          (p.address_city ?? '').trim() ||
          (p.address_postal_code ?? '').trim() ||
          (p.address_country ?? '').trim();
        if (hasStructured) {
          setAddressStreet(p.address_street ?? '');
          setAddressCity(p.address_city ?? '');
          setAddressPostalCode(p.address_postal_code ?? '');
          setAddressCountry(p.address_country ?? '');
        } else {
          setAddressStreet((p.business_address ?? '').trim());
          setAddressCity('');
          setAddressPostalCode('');
          setAddressCountry('');
        }
        setTaxId(p.tax_id ?? '');
        setVatId(p.vat_id ?? '');
        setVerificationStatus(p.verification_status ?? '');
        setVerificationSubmittedAt(
          p.verification_submitted_at ? String(p.verification_submitted_at) : ''
        );
        setInsurancePolicyNumber(p.insurance_policy_number ?? '');
        setInsuranceCoverage(p.insurance_coverage ?? '');
        setInsuranceStart(p.insurance_start ?? '');
        setInsuranceEnd(p.insurance_end ?? '');
        setInsuranceProvider(p.insurance_provider ?? '');
        setPrivacyPolicyText(p.privacy_policy_text ?? '');
        setTermsConditionsText(p.terms_conditions_text ?? '');
        setBusinessLogoUrl((p.business_logo_url ?? '').trim());
        setCompanyRegistrationPath((p.company_registration_document_path ?? '').trim());
      }
    });
  }, [section, user?.id, isSupabase]);

  const refreshSupplierOnboardingSignals = useCallback(async () => {
    if (!user?.id || !isSupabase) {
      setOnboardingListingCount(0);
      setOnboardingHasPayout(false);
      setOnboardingHasCompany(false);
      setVerificationStatus('');
      setVerificationSubmittedAt('');
      setPayoutVerificationStatus('');
      setPayoutVerificationSubmittedAt('');
      setBusinessVerificationFeedback('');
      setPayoutVerificationFeedback('');
      return;
    }
    const [profile, listings] = await Promise.all([
      fetchSupplierProfile(user.id),
      fetchMyListings(user.id),
    ]);
    setOnboardingListingCount(listings.length);
    setOnboardingHasPayout(isSupplierPayoutConfigured(profile));
    setOnboardingHasCompany(isSupplierBusinessProfileComplete(profile));
    setVerificationStatus((profile?.verification_status ?? '').trim());
    setVerificationSubmittedAt(
      profile?.verification_submitted_at ? String(profile.verification_submitted_at) : ''
    );
    setPayoutVerificationStatus((profile?.payout_verification_status ?? '').trim());
    setPayoutVerificationSubmittedAt(
      profile?.payout_verification_submitted_at ? String(profile.payout_verification_submitted_at) : ''
    );
    setBusinessVerificationFeedback((profile?.business_verification_feedback ?? '').trim());
    setPayoutVerificationFeedback((profile?.payout_verification_feedback ?? '').trim());
  }, [user?.id, isSupabase]);

  useEffect(() => {
    void refreshSupplierOnboardingSignals();
  }, [refreshSupplierOnboardingSignals, section]);

  useEffect(() => {
    const ev = 'traverion:supplier-onboarding-refresh';
    const onRefresh = () => void refreshSupplierOnboardingSignals();
    window.addEventListener(ev, onRefresh);
    return () => window.removeEventListener(ev, onRefresh);
  }, [refreshSupplierOnboardingSignals]);

  useEffect(() => {
    const syncFromPath = (fromPop: boolean) => {
      const s = getSectionFromPath(window.location.pathname);
      if (s) setSection(s);
      if (fromPop) setPathEpoch((e) => e + 1);
    };
    syncFromPath(false);
    const onPop = () => syncFromPath(true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!settingsFocus) return;
    if (settingsFocus === 'legal' && section === 'business-profile' && businessProfileTab !== 'legal') return;
    const idMap: Record<AccountShortcutTarget, string> = {
      company: 'supplier-business-company',
      legal: 'supplier-business-legal',
      account: 'supplier-account-email',
      security: 'supplier-account-security',
      payout: 'supplier-business-payout',
    };
    const el = document.getElementById(idMap[settingsFocus]);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    setSettingsFocus(null);
  }, [section, settingsFocus, businessProfileTab]);

  useEffect(() => {
    if (section !== 'business-profile') return;
    const applyHash = () => {
      const h = window.location.hash.replace(/^#/, '');
      if (h === 'legal') setBusinessProfileTab('legal');
      else setBusinessProfileTab('company');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [section]);

  const operatorDisplayName = companyLegalName.trim() || profileDisplayName.trim() || 'Your business';

  const formattedBusinessAddress = useMemo(
    () =>
      formatSupplierBusinessAddressFromParts({
        address_street: addressStreet,
        address_postal_code: addressPostalCode,
        address_city: addressCity,
        address_country: addressCountry,
      }),
    [addressStreet, addressPostalCode, addressCity, addressCountry]
  );

  const fillPrivacyTemplate = () => {
    const raw = applyLegalDate(defaultPrivacyPolicyTemplate());
    setPrivacyPolicyText(
      applyLegalPlaceholders(raw, {
        operatorName: operatorDisplayName,
        businessAddress: formattedBusinessAddress,
      })
    );
  };

  const fillTermsTemplate = () => {
    const raw = applyLegalDate(defaultTermsConditionsTemplate());
    setTermsConditionsText(
      applyLegalPlaceholders(raw, {
        operatorName: operatorDisplayName,
        businessAddress: formattedBusinessAddress,
      })
    );
  };

  const handleNavigate = (s: SupplierSection) => {
    setSection(s);
    window.history.pushState({}, '', pathForSection(s));
    window.dispatchEvent(new PopStateEvent('popstate'));
    setAccountMenuOpen(false);
    setMobileAccountOpen(false);
  };

  const openSettingsFocus = (target: AccountShortcutTarget) => {
    if (target === 'security') {
      handleNavigate('change-password');
      return;
    }
    setSettingsFocus(target);
    if (target === 'account') {
      handleNavigate('account-settings');
    } else {
      handleNavigate('business-profile');
      if (target === 'legal') {
        window.location.hash = 'legal';
        setBusinessProfileTab('legal');
      } else {
        window.location.hash = 'company';
        setBusinessProfileTab('company');
      }
    }
  };

  const handleAuthenticated = () => {
    setSection('dashboard');
    window.location.replace(PARTNER_APP_BASE);
  };

  void pathEpoch;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const onLoginPath = isSupplierLoginPath(pathname);
  const onPortalPath = isSupplierPortalPath(pathname);
  const partnerMarketingPage = partnerMarketingPageFromPathname(pathname);
  const onboardingHasListing = onboardingListingCount !== null && onboardingListingCount > 0;
  const onboardingBusinessVerified = verificationStatus.trim().toLowerCase() === 'verified';
  const onboardingPayoutVerified = payoutVerificationStatus.trim().toLowerCase() === 'verified';
  const onboardingComplete =
    onboardingHasListing && onboardingPayoutVerified && onboardingBusinessVerified;

  const normalizedPathForVerify = pathname.replace(/\/$/, '') || '/';
  if (normalizedPathForVerify === PARTNER_EMAIL_VERIFIED_PATH) {
    return <PartnerEmailVerifiedPage />;
  }

  if (isPartnerResetPasswordPath(pathname)) {
    return <PartnerResetPasswordPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (partnerMarketingPage && isPartnerMarketingPathForCurrentHost(pathname)) {
    return <PartnerMarketingStaticPage pageId={partnerMarketingPage} />;
  }

  if (onPortalPath && !user) {
    window.location.replace(SUPPLIER_LOGIN_PATH);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Redirecting to login...</p>
      </div>
    );
  }

  if (onLoginPath && user) {
    if (partnerGateView === 'checking' || partnerGateView === 'blocked') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">
            {partnerGateView === 'blocked' ? 'Redirecting to sign in…' : 'Checking partner account…'}
          </p>
        </div>
      );
    }
    if (partnerGateView === 'error') {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-gray-600 max-w-md">
            We could not verify your partner account. Check your connection and try again.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPartnerGateRetryKey((k) => k + 1)}
              className="rounded-xl bg-finland px-4 py-2.5 text-sm font-semibold text-white hover:bg-finland-dark transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    if (partnerGateView === 'allowed') {
      window.location.replace(PARTNER_APP_BASE);
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">Redirecting...</p>
        </div>
      );
    }
  }

  const needsPartnerProfileGate = Boolean(user && onPortalPath);
  if (needsPartnerProfileGate) {
    if (partnerGateView === 'checking') {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 text-gray-500">
          <p className="text-sm">Checking partner account…</p>
        </div>
      );
    }
    if (partnerGateView === 'error') {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-gray-600 max-w-md">
            We could not verify your partner account. Check your connection and try again.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPartnerGateRetryKey((k) => k + 1)}
              className="rounded-xl bg-finland px-4 py-2.5 text-sm font-semibold text-white hover:bg-finland-dark transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    if (partnerGateView === 'blocked') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">Redirecting to sign in…</p>
        </div>
      );
    }
  }

  if (onLoginPath && !user) {
    return <SupplierLoginPage onAuthenticated={handleAuthenticated} isSupabase={isSupabase} />;
  }

  return (
    <div className="partner-app-shell min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <button type="button" onClick={() => handleNavigate('dashboard')} className="lux-flat flex items-center gap-2 shrink-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain" />
            <span className="hidden sm:inline font-sans text-[11px] font-semibold tracking-[0.2em]">TRAVERION</span>
          </button>
          <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Primary">
            {PRIMARY_NAV.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`lux-flat px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active ? 'bg-ink text-paper-raised' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="lux-flat hidden md:inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper-raised text-xs font-semibold"
              aria-label="Account"
            >
              {(user?.email ?? user?.id ?? 'S').slice(0, 1).toUpperCase()}
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 top-11 w-64 rounded-2xl bg-paper-raised shadow-soft-xl p-2 z-50">
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.16em] text-ink-faint">Business</p>
                <button type="button" onClick={() => handleNavigate('earnings')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Money</button>
                <button type="button" onClick={() => handleNavigate('reviews')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Reviews</button>
                <button type="button" onClick={() => handleNavigate('discounts')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Offers</button>
                <button type="button" onClick={() => handleNavigate('pickup')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Pickup</button>
                <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-ink-faint">Account</p>
                <button type="button" onClick={() => openSettingsFocus('company')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Business</button>
                <button type="button" onClick={() => openSettingsFocus('account')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Settings</button>
                {!onboardingComplete && (
                  <button type="button" onClick={() => handleNavigate('onboarding')} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-paper">Finish setup</button>
                )}
                <button type="button" onClick={() => signOut()} className="lux-flat w-full text-left px-3 py-2 rounded-xl text-sm text-red-700 hover:bg-paper">Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileAccountOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-paper pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-display text-2xl">Account</h2>
            <button type="button" onClick={() => setMobileAccountOpen(false)} className="lux-tap-target p-2" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 space-y-1">
            <button type="button" onClick={() => handleNavigate('earnings')} className="lux-flat w-full text-left py-3.5 text-base">Money</button>
            <button type="button" onClick={() => handleNavigate('reviews')} className="lux-flat w-full text-left py-3.5 text-base">Reviews</button>
            <button type="button" onClick={() => handleNavigate('discounts')} className="lux-flat w-full text-left py-3.5 text-base">Offers</button>
            <button type="button" onClick={() => handleNavigate('pickup')} className="lux-flat w-full text-left py-3.5 text-base">Pickup</button>
            <button type="button" onClick={() => openSettingsFocus('company')} className="lux-flat w-full text-left py-3.5 text-base">Business</button>
            <button type="button" onClick={() => openSettingsFocus('account')} className="lux-flat w-full text-left py-3.5 text-base">Settings</button>
            {!onboardingComplete && (
              <button type="button" onClick={() => handleNavigate('onboarding')} className="lux-flat w-full text-left py-3.5 text-base">Finish setup</button>
            )}
            <button type="button" onClick={() => signOut()} className="lux-flat w-full text-left py-3.5 text-base text-red-700">Log out</button>
          </div>
        </div>
      )}

      <main className={`mx-auto w-full max-w-6xl min-w-0 px-4 sm:px-6 pt-4 pb-[max(1.5rem,calc(5.25rem+env(safe-area-inset-bottom)))] lg:pb-16 ${section === 'availability' ? 'max-w-none lg:px-10' : ''}`}>
        <div className="lux-page-enter w-full min-w-0">
          {section === 'onboarding' && (
            <PartnerOnboarding
              onSkip={() => handleNavigate('dashboard')}
              onBusiness={() => openSettingsFocus('company')}
              onPayout={() => openSettingsFocus('payout')}
              onTours={() => handleNavigate('listings')}
              businessDone={onboardingHasCompany}
              payoutDone={onboardingHasPayout}
              hasTour={(onboardingListingCount ?? 0) > 0}
            />
          )}
          {section === 'dashboard' && (
            <SupplierDashboard onNavigateToBookings={() => handleNavigate('bookings')} />
          )}
          {section === 'listings' && <SupplierListings />}
          {section === 'availability' && <SupplierAvailability />}
          {section === 'bookings' && <SupplierBookings />}
          {section === 'earnings' && <SupplierEarnings />}
          {section === 'discounts' && <SupplierDiscountsOffers />}
          {section === 'reviews' && <SupplierReviews />}
          {section === 'pickup' && <SupplierPickupPlanner />}
          {section === 'change-password' && (
            <SupplierChangePassword
              onBack={() => handleNavigate('account-settings')}
              userEmail={supplierEmail}
              isSupabase={isSupabase}
              supabase={supabase}
            />
          )}
          {(section === 'business-profile' || section === 'account-settings') && (
            <SupplierSettingsPages
              variant={section === 'account-settings' ? 'account-settings' : 'business-profile'}
              user={user as User | null}
              isSupabase={isSupabase}
              supabase={supabase}
              supplierEmail={supplierEmail}
              supplierEmailVerified={supplierEmailVerified}
              verificationSending={verificationSending}
              verificationMessage={verificationMessage}
              setVerificationMessage={setVerificationMessage}
              setVerificationSending={setVerificationSending}
              handleNavigate={(s) => handleNavigate(s as SupplierSection)}
              businessProfileTab={businessProfileTab}
              setBusinessProfileTab={setBusinessProfileTab}
              payoutIban={payoutIban}
              setPayoutIban={setPayoutIban}
              payoutBic={payoutBic}
              setPayoutBic={setPayoutBic}
              payoutVerificationStatus={payoutVerificationStatus}
              payoutVerificationSubmittedAt={payoutVerificationSubmittedAt}
              setPayoutVerificationStatus={setPayoutVerificationStatus}
              setPayoutVerificationSubmittedAt={setPayoutVerificationSubmittedAt}
              businessVerificationFeedback={businessVerificationFeedback}
              payoutVerificationFeedback={payoutVerificationFeedback}
              setBusinessVerificationFeedback={setBusinessVerificationFeedback}
              setPayoutVerificationFeedback={setPayoutVerificationFeedback}
              paymentCycle={paymentCycle}
              setPaymentCycle={setPaymentCycle}
              payoutThreshold={payoutThreshold}
              setPayoutThreshold={setPayoutThreshold}
              payoutSaving={payoutSaving}
              payoutMessage={payoutMessage}
              setPayoutSaving={setPayoutSaving}
              setPayoutMessage={setPayoutMessage}
              updateSupplierPayout={updateSupplierPayout}
              businessType={businessType}
              setBusinessType={setBusinessType}
              companyLegalName={companyLegalName}
              setCompanyLegalName={setCompanyLegalName}
              companyRegistrationNumber={companyRegistrationNumber}
              setCompanyRegistrationNumber={setCompanyRegistrationNumber}
              managingDirectors={managingDirectors}
              setManagingDirectors={setManagingDirectors}
              addressStreet={addressStreet}
              setAddressStreet={setAddressStreet}
              addressCountry={addressCountry}
              setAddressCountry={setAddressCountry}
              addressCity={addressCity}
              setAddressCity={setAddressCity}
              addressPostalCode={addressPostalCode}
              setAddressPostalCode={setAddressPostalCode}
              taxId={taxId}
              setTaxId={setTaxId}
              vatId={vatId}
              setVatId={setVatId}
              verificationStatus={verificationStatus}
              verificationSubmittedAt={verificationSubmittedAt}
              setVerificationSubmittedAt={setVerificationSubmittedAt}
              businessTypeAtLastFetch={businessTypeAtLastFetch}
              companySaving={companySaving}
              companyMessage={companyMessage}
              setCompanySaving={setCompanySaving}
              setCompanyMessage={setCompanyMessage}
              updateSupplierCompanyProfile={updateSupplierCompanyProfile}
              insurancePolicyNumber={insurancePolicyNumber}
              setInsurancePolicyNumber={setInsurancePolicyNumber}
              insuranceCoverage={insuranceCoverage}
              setInsuranceCoverage={setInsuranceCoverage}
              insuranceStart={insuranceStart}
              setInsuranceStart={setInsuranceStart}
              insuranceEnd={insuranceEnd}
              setInsuranceEnd={setInsuranceEnd}
              insuranceProvider={insuranceProvider}
              setInsuranceProvider={setInsuranceProvider}
              privacyPolicyText={privacyPolicyText}
              setPrivacyPolicyText={setPrivacyPolicyText}
              termsConditionsText={termsConditionsText}
              setTermsConditionsText={setTermsConditionsText}
              legalSaving={legalSaving}
              legalMessage={legalMessage}
              setLegalSaving={setLegalSaving}
              setLegalMessage={setLegalMessage}
              legalDocModal={legalDocModal}
              setLegalDocModal={setLegalDocModal}
              operatorDisplayName={operatorDisplayName}
              fillPrivacyTemplate={fillPrivacyTemplate}
              fillTermsTemplate={fillTermsTemplate}
              businessLogoUrl={businessLogoUrl}
              setBusinessLogoUrl={setBusinessLogoUrl}
              companyRegistrationPath={companyRegistrationPath}
              setCompanyRegistrationPath={setCompanyRegistrationPath}
              setVerificationStatus={setVerificationStatus}
              onCompanyProfileSaved={() => {
                setBusinessTypeAtLastFetch(businessType);
                void refreshSupplierOnboardingSignals();
              }}
              onPayoutSaved={() => {
                void refreshSupplierOnboardingSignals();
              }}
            />
          )}
        </div>
      </main>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-black/[0.04]"
        aria-label="Primary"
      >
        <div className="flex items-stretch justify-around max-w-lg mx-auto px-1">
          {PRIMARY_NAV.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleNavigate(tab.id)}
                className={`lux-flat flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] ${
                  active ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                <tab.icon className="w-5 h-5" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileAccountOpen(true)}
            className={`lux-flat flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] ${
              mobileAccountOpen ? 'text-ink' : 'text-ink-faint'
            }`}
          >
            <UserCircle2 className="w-5 h-5" strokeWidth={mobileAccountOpen ? 2.4 : 1.8} aria-hidden />
            <span className="text-[10px] font-semibold">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
