import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  LayoutDashboard,
  MapPin,
  Calendar,
  DollarSign,
  Building2,
  Users,
  LogOut,
  Menu,
  X,
  Star,
  ClipboardList,
  UserCircle2,
  ChevronDown,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { supabase } from '../../lib/supabase';
import SupplierDashboard from '../../pages/supplier/SupplierDashboard';
import SupplierListings from '../../pages/supplier/SupplierListings';
import SupplierBookings from '../../pages/supplier/SupplierBookings';
import SupplierEarnings from '../../pages/supplier/SupplierEarnings';
import SupplierReviews from '../../pages/supplier/SupplierReviews';
import SupplierPickupPlanner from '../../pages/supplier/SupplierPickupPlanner';
import {
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
import { userHasSupplierProfile } from '../../lib/supplierPortalAccess';
import { isPartnerMarketingPathForCurrentHost } from '../../lib/partnerHost';
import {
  PARTNER_APP_BASE,
  PARTNER_EMAIL_VERIFIED_PATH,
  PARTNER_LOGIN_PATH,
  partnerMarketingPageFromPathname,
} from '../../lib/partnerPortalPaths';
import PartnerMarketingStaticPage from './PartnerMarketingStaticPage';
import PartnerEmailVerifiedPage from './PartnerEmailVerifiedPage';
import SupplierPortalTravelerNotice from './SupplierPortalTravelerNotice';

type PartnerProfileGate =
  | { kind: 'pending'; forUserId: string }
  | { kind: 'resolved'; forUserId: string; allowed: boolean }
  | { kind: 'failed'; forUserId: string };

/** @deprecated Use PARTNER_LOGIN_PATH from partnerPortalPaths */
export const SUPPLIER_LOGIN_PATH = PARTNER_LOGIN_PATH;

type SupplierSection =
  | 'dashboard'
  | 'listings'
  | 'bookings'
  | 'earnings'
  | 'reviews'
  | 'pickup'
  | 'business-profile'
  | 'account-settings'
  | 'badges';
type AccountShortcutTarget = 'company' | 'legal' | 'account' | 'security' | 'payout';
type BusinessProfileTab = 'company' | 'legal';
type BadgeVariant = 'gold' | 'verified' | 'trusted';

const NAV_ITEMS: { id: SupplierSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'listings', label: 'My listings', icon: MapPin },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'pickup', label: 'Pickup planner', icon: ClipboardList },
  { id: 'business-profile', label: 'Business profile', icon: Building2 },
  { id: 'account-settings', label: 'Account settings', icon: Users },
];
const ROUTABLE_SECTIONS = [...NAV_ITEMS.map((n) => n.id), 'badges'] as const;
type ExtraSupplierSection = (typeof ROUTABLE_SECTIONS)[number];

function getSectionFromPath(pathname: string): SupplierSection | null {
  const base = PARTNER_APP_BASE;
  if (pathname === base || pathname === `${base}/`) return 'dashboard';
  const match = pathname.match(new RegExp(`^${base}/([a-z-]+)`));
  if (!match) return null;
  if (match[1] === 'settings') return 'business-profile';
  const section = match[1] as ExtraSupplierSection;
  return ROUTABLE_SECTIONS.includes(section) ? (section as SupplierSection) : 'dashboard';
}

function isSupplierLoginPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '');
  return p === PARTNER_LOGIN_PATH;
}

function isSupplierPortalPath(pathname: string): boolean {
  return (
    pathname === PARTNER_APP_BASE ||
    pathname === `${PARTNER_APP_BASE}/` ||
    pathname.startsWith(`${PARTNER_APP_BASE}/`)
  );
}

type SetupStripProps = {
  listingCount: number | null;
  hasPayoutConfigured: boolean;
  payoutVerificationStatus: string;
  payoutVerificationSubmittedAt: string;
  verificationStatus: string;
  profileComplete: boolean;
  onListings: () => void;
  onPayout: () => void;
  onProfile: () => void;
};

function SupplierSetupProgressStrip({
  listingCount,
  hasPayoutConfigured,
  payoutVerificationStatus,
  payoutVerificationSubmittedAt,
  verificationStatus,
  profileComplete,
  onListings,
  onPayout,
  onProfile,
}: SetupStripProps) {
  const hasListing = listingCount !== null && listingCount > 0;
  const v = verificationStatus.trim().toLowerCase();
  const verified = v === 'verified';
  const rejected = v === 'rejected';
  const inReview = profileComplete && !verified && !rejected && (v === 'pending' || v === '');

  const verificationDetail = verified
    ? 'Approved by Traverion.'
    : rejected
      ? 'Update and resubmit.'
      : inReview
        ? 'Review in progress.'
        : 'Submit profile for review.';

  const pv = payoutVerificationStatus.trim().toLowerCase();
  const payoutSubmitted = (payoutVerificationSubmittedAt ?? '').trim() !== '';
  const payoutVerified = pv === 'verified';
  const payoutRejected = pv === 'rejected';
  const payoutInReview =
    hasPayoutConfigured && !payoutVerified && !payoutRejected && pv === 'pending' && payoutSubmitted;

  const payoutDetail = payoutVerified
    ? 'IBAN/BIC approved by Traverion.'
    : payoutRejected
      ? 'Update bank details and save again.'
      : payoutInReview
        ? 'Review in progress.'
        : hasPayoutConfigured
          ? 'Save payout details in Settings to submit for verification.'
          : 'Add IBAN and BIC in Settings.';

  const doneCount = [verified, payoutVerified, hasListing].filter(Boolean).length;
  const steps = [verified, payoutVerified, hasListing] as const;

  const chip = (
    done: boolean,
    tone: 'emerald' | 'amber' | 'sky' | 'red',
    onClick: () => void,
    icon: ReactNode,
    title: string,
    hint: string
  ) => {
    const tones = {
      emerald: done
        ? 'border-emerald-200/90 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-50'
        : 'border-slate-200/90 bg-slate-50/80 text-slate-700 hover:bg-slate-50',
      amber: 'border-amber-200/90 bg-amber-50/90 text-amber-950 hover:bg-amber-50',
      sky: 'border-sky-200/90 bg-sky-50/90 text-sky-950 hover:bg-sky-50/80',
      red: 'border-red-200/90 bg-red-50/90 text-red-950 hover:bg-red-50/80',
    };
    const t = done && tone === 'emerald' ? tones.emerald : tones[tone];
    return (
      <button
        type="button"
        onClick={onClick}
        className={`touch-manipulation group flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-xs transition-colors active:scale-[0.99] ${t}`}
      >
        <span className="shrink-0 opacity-90 [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>
        <span className="min-w-0">
          <span className="block font-semibold leading-tight tracking-tight">{title}</span>
          <span className="mt-0.5 block text-[10px] leading-snug text-slate-600 group-hover:text-slate-700">{hint}</span>
        </span>
      </button>
    );
  };

  return (
    <div
      className="mb-3 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]"
      role="region"
      aria-label="Supplier setup progress"
    >
      <div
        className="h-0.5 bg-gradient-to-r from-finland via-indigo-500 to-violet-500"
        aria-hidden
      />
      <div className="px-2.5 py-2 sm:px-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-slate-900">Supplier setup</p>
            <p className="mt-0.5 hidden text-[11px] leading-snug text-slate-500 sm:block">
              Business and payout are verified separately. Publish only after Traverion approves both.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full bg-finland/12 px-2 py-0.5 text-[11px] font-bold tabular-nums text-finland ring-1 ring-finland/20">
            {doneCount}/3
          </span>
        </div>
        <div
          className="mb-1.5 flex h-1 gap-px overflow-hidden rounded-full bg-slate-100 p-px"
          aria-hidden
        >
          {steps.map((s, i) => (
            <div
              key={i}
              className={`h-full flex-1 rounded-full transition-colors ${s ? 'bg-finland' : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-1">
          <li className="min-w-0">
            {chip(
              verified,
              verified ? 'emerald' : inReview ? 'sky' : rejected ? 'red' : 'amber',
              onProfile,
              verified ? (
                <CheckCircle2 className="text-emerald-600" aria-hidden />
              ) : inReview ? (
                <Clock className="text-sky-600" aria-hidden />
              ) : rejected ? (
                <AlertTriangle className="text-red-600" aria-hidden />
              ) : (
                <Circle className="text-slate-400" aria-hidden />
              ),
              verified ? 'Verified' : rejected ? 'Needs update' : inReview ? 'In review' : 'Verification',
              verificationDetail
            )}
          </li>
          <li className="min-w-0">
            {chip(
              payoutVerified,
              payoutVerified ? 'emerald' : payoutInReview ? 'sky' : payoutRejected ? 'red' : 'amber',
              onPayout,
              payoutVerified ? (
                <CheckCircle2 className="text-emerald-600" aria-hidden />
              ) : payoutInReview ? (
                <Clock className="text-sky-600" aria-hidden />
              ) : payoutRejected ? (
                <AlertTriangle className="text-red-600" aria-hidden />
              ) : (
                <Circle className="text-slate-400" aria-hidden />
              ),
              payoutVerified
                ? 'Payout verified'
                : payoutRejected
                  ? 'Payout needs update'
                  : payoutInReview
                    ? 'Payout in review'
                    : 'Payout details',
              payoutDetail
            )}
          </li>
          <li className="min-w-0">
            {chip(
              hasListing,
              'emerald',
              onListings,
              hasListing ? (
                <CheckCircle2 className="text-emerald-600" aria-hidden />
              ) : (
                <Circle className="text-slate-400" aria-hidden />
              ),
              hasListing ? 'Listing live' : 'Publish a listing',
              hasListing ? 'At least one tour on file.' : 'Create a tour (draft is fine).'
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function SupplierLayout() {
  const { user, loading, signOut, isSupabase } = useSupplierAuth();
  const [partnerProfileGate, setPartnerProfileGate] = useState<PartnerProfileGate | null>(null);
  const [partnerGateRetryKey, setPartnerGateRetryKey] = useState(0);
  const partnerGateEpochRef = useRef(0);
  const [section, setSection] = useState<SupplierSection>(() => getSectionFromPath(window.location.pathname) ?? 'dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<'success' | 'error' | null>(null);
  const [badgeEnabled, setBadgeEnabled] = useState(false);
  const [badgeVariant, setBadgeVariant] = useState<BadgeVariant>('gold');
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<'sent' | 'error' | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string>('');
  const [companyRegistrationPath, setCompanyRegistrationPath] = useState('');
  const [pathEpoch, setPathEpoch] = useState(0);

  const supplierEmail = typeof user?.email === 'string' ? user.email : '';
  const supplierEmailVerified = Boolean((user as { email_confirmed_at?: string | null } | null)?.email_confirmed_at);

  useEffect(() => {
    if (!user?.id || !isSupabase || !supabase) {
      setPartnerProfileGate(null);
      return;
    }
    const uid = user.id;
    const epoch = ++partnerGateEpochRef.current;
    let cancelled = false;
    setPartnerProfileGate({ kind: 'pending', forUserId: uid });

    const stale = () => cancelled || epoch !== partnerGateEpochRef.current;

    const run = async () => {
      let falseStreak = 0;
      const maxPasses = 14;
      for (let attempt = 0; attempt < maxPasses && !stale(); attempt++) {
        const ok = await userHasSupplierProfile(supabase, uid);
        if (stale()) return;
        if (ok === true) {
          setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: true });
          return;
        }
        if (ok === false) {
          falseStreak += 1;
          // Avoid flashing traveler on one transient empty read (Strict Mode, cold JWT, etc.)
          if (falseStreak >= 2 && attempt >= 1) {
            setPartnerProfileGate({ kind: 'resolved', forUserId: uid, allowed: false });
            return;
          }
        } else {
          falseStreak = 0;
        }
        await new Promise((r) => setTimeout(r, 100 + attempt * 45));
      }
      if (stale()) return;
      const last = await userHasSupplierProfile(supabase, uid);
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
    const savedBadge = localStorage.getItem('supplier_badge_state');
    if (savedBadge) {
      try {
        const parsed = JSON.parse(savedBadge) as { enabled?: boolean; variant?: BadgeVariant };
        setBadgeEnabled(!!parsed.enabled);
        if (parsed.variant === 'gold' || parsed.variant === 'verified' || parsed.variant === 'trusted') {
          setBadgeVariant(parsed.variant);
        }
      } catch {
        // ignore invalid local data
      }
    }
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
    const path = s === 'dashboard' ? PARTNER_APP_BASE : `${PARTNER_APP_BASE}/${s}`;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setSidebarOpen(false);
    setAccountMenuOpen(false);
    setMobileAccountOpen(false);
  };

  const openSettingsFocus = (target: AccountShortcutTarget) => {
    setSettingsFocus(target);
    if (target === 'account' || target === 'security') {
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
  const onboardingDoneCount = [onboardingHasListing, onboardingPayoutVerified, onboardingBusinessVerified].filter(
    Boolean
  ).length;
  const onboardingComplete = onboardingDoneCount === 3;
  const payoutSubmittedForReview = (payoutVerificationSubmittedAt ?? '').trim() !== '';
  const payoutV = payoutVerificationStatus.trim().toLowerCase();
  const onboardingNextLabel =
    !onboardingBusinessVerified
      ? verificationStatus.trim().toLowerCase() === 'rejected'
        ? 'Update profile after rejection'
        : onboardingHasCompany && ['pending', ''].includes(verificationStatus.trim().toLowerCase())
          ? 'Business verification in progress'
          : 'Complete business profile'
      : !onboardingHasPayout
        ? 'Add bank details (IBAN + BIC)'
        : !onboardingPayoutVerified
          ? payoutV === 'rejected'
            ? 'Update payout details after rejection'
            : payoutV === 'pending' && payoutSubmittedForReview
              ? 'Payout verification in progress'
              : 'Save payout details for verification'
          : !onboardingHasListing
            ? 'Publish your first listing'
            : 'Open business profile';
  const onboardingNextAction =
    !onboardingBusinessVerified
      ? () => openSettingsFocus('company')
      : !onboardingHasPayout
        ? () => openSettingsFocus('payout')
        : !onboardingPayoutVerified
          ? () => openSettingsFocus('payout')
          : !onboardingHasListing
            ? () => handleNavigate('listings')
            : () => handleNavigate('business-profile');

  const normalizedPathForVerify = pathname.replace(/\/$/, '') || '/';
  if (normalizedPathForVerify === PARTNER_EMAIL_VERIFIED_PATH) {
    return <PartnerEmailVerifiedPage />;
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

  /** Signed-in users on /login always go to the app shell first — never show traveler notice here (avoids flash). */
  if (onLoginPath && user) {
    window.location.replace(PARTNER_APP_BASE);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Redirecting...</p>
      </div>
    );
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
        <SupplierPortalTravelerNotice
          email={typeof user?.email === 'string' ? user.email : null}
          onSignOut={() => void signOut()}
        />
      );
    }
  }

  if (onLoginPath && !user) {
    return <SupplierLoginPage onAuthenticated={handleAuthenticated} isSupabase={isSupabase} />;
  }

  return (
    <div className="min-h-[100dvh] min-h-screen bg-gray-50 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-30">
        <div className="p-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="flex items-center gap-2 text-gray-900 font-semibold text-left w-full rounded-lg hover:bg-gray-50 transition-colors duration-200 -mx-1 px-1 py-0.5"
            title="Go to supplier dashboard"
          >
            <img src={BRAND_LOGO_SRC} alt="" className="h-9 w-9 object-contain flex-shrink-0" />
            TRAVERION
          </button>
          <p className="text-xs text-gray-500 mt-0.5">Supplier portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`lux-flat w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors duration-300 ease-lux ${
                section === item.id ? 'bg-finland/10 text-finland' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => signOut()}
            className="lux-flat w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors duration-300 ease-lux"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`lg:hidden fixed top-0 left-0 w-[min(18rem,100vw)] h-full max-h-[100dvh] bg-white border-r border-gray-200 z-50 transform transition-transform duration-250 ease-out-smooth ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              handleNavigate('dashboard');
              setSidebarOpen(false);
            }}
            className="flex items-center gap-2 text-gray-900 font-semibold text-left min-w-0 rounded-lg hover:bg-gray-50 transition-colors duration-200 -mx-1 px-1 py-0.5"
            title="Go to supplier dashboard"
          >
            <img src={BRAND_LOGO_SRC} alt="" className="h-9 w-9 object-contain flex-shrink-0" />
            TRAVERION
          </button>
          <button type="button" onClick={() => setSidebarOpen(false)} className="no-lux-interaction lux-tap-target p-2 text-gray-500 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-3 space-y-0.5 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                handleNavigate(item.id);
                setSidebarOpen(false);
              }}
              className={`touch-manipulation lux-flat w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg text-left text-sm font-medium transition-colors duration-300 ease-lux ${
                section === item.id ? 'bg-finland/10 text-finland' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => signOut()}
            className="lux-flat w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors duration-300 ease-lux"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:pl-64">
        <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-20 min-h-[3.5rem] flex items-center px-3 sm:px-6 lg:px-8 pt-[env(safe-area-inset-top)] supports-[backdrop-filter]:bg-white/90 transition-shadow duration-500 ease-lux relative">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="no-lux-interaction lux-tap-target lg:hidden p-1.5 -ml-1.5 text-gray-600 rounded-lg shrink-0 z-10"
          >
            <Menu className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:hidden z-10 p-0.5 min-w-0"
            aria-label="Traverion supplier home"
          >
            <img
              src={BRAND_LOGO_SRC}
              alt=""
              className="h-11 w-11 max-h-[48px] max-w-[48px] object-contain"
            />
          </button>
          <div className="flex items-center gap-1 relative z-10 ml-auto shrink-0">
            <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline" title="You are in the supplier portal">
              Supplier portal
            </span>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="hidden lg:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <span className="w-7 h-7 rounded-full bg-finland/10 text-finland border border-finland/20 inline-flex items-center justify-center text-xs font-semibold">
                {(user?.email ?? user?.id ?? 'S').slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileAccountOpen(true)}
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-finland"
              aria-label="Open account menu"
            >
              <UserCircle2 className="w-5 h-5" />
            </button>
            {accountMenuOpen && (
              <div className="hidden lg:block absolute right-0 top-12 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50">
                <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-500">Traverion supplier account</p>
                <button type="button" onClick={() => openSettingsFocus('company')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">Business profile</button>
                <button type="button" onClick={() => openSettingsFocus('legal')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">Legal obligations</button>
                <button type="button" onClick={() => openSettingsFocus('account')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">Account settings</button>
                <button type="button" onClick={() => openSettingsFocus('security')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">Security and password</button>
                <button type="button" onClick={() => handleNavigate('badges')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm">Brand assets</button>
                <button type="button" onClick={() => signOut()} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-red-600">Log out</button>
              </div>
            )}
          </div>
        </header>
        {mobileAccountOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-white pt-[env(safe-area-inset-top)]">
            <div className="h-14 px-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Account</h2>
              <button type="button" onClick={() => setMobileAccountOpen(false)} className="p-2 rounded-lg text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(100dvh-3.5rem)] pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="px-1 pt-1 pb-2 text-xs uppercase tracking-wide text-gray-500">Traverion supplier account</p>
              <button type="button" onClick={() => openSettingsFocus('company')} className="touch-manipulation w-full text-left px-4 py-3.5 min-h-[44px] rounded-xl border border-gray-200 active:bg-gray-50">Business profile</button>
              <button type="button" onClick={() => openSettingsFocus('legal')} className="touch-manipulation w-full text-left px-4 py-3.5 min-h-[44px] rounded-xl border border-gray-200 active:bg-gray-50">Legal obligations</button>
              <button type="button" onClick={() => openSettingsFocus('account')} className="touch-manipulation w-full text-left px-4 py-3.5 min-h-[44px] rounded-xl border border-gray-200 active:bg-gray-50">Account settings</button>
              <button type="button" onClick={() => openSettingsFocus('security')} className="touch-manipulation w-full text-left px-4 py-3.5 min-h-[44px] rounded-xl border border-gray-200 active:bg-gray-50">Security and password</button>
              <button type="button" onClick={() => handleNavigate('badges')} className="touch-manipulation w-full text-left px-4 py-3.5 min-h-[44px] rounded-xl border border-gray-200 active:bg-gray-50">Brand assets</button>
              <button type="button" onClick={() => signOut()} className="touch-manipulation w-full text-left px-4 py-3.5 min-h-[44px] rounded-xl border border-red-200 text-red-600 active:bg-red-50">Log out</button>
            </div>
          </div>
        )}
        <main className="w-full max-w-[100vw] overflow-x-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 sm:px-6 sm:pb-6 sm:pt-0 lg:px-8 lg:pb-8">
          {isSupabase && user && !onboardingComplete && (
            <SupplierSetupProgressStrip
              listingCount={onboardingListingCount}
              hasPayoutConfigured={onboardingHasPayout}
              payoutVerificationStatus={payoutVerificationStatus}
              payoutVerificationSubmittedAt={payoutVerificationSubmittedAt}
              verificationStatus={verificationStatus}
              profileComplete={onboardingHasCompany}
              onListings={() => handleNavigate('listings')}
              onPayout={() => openSettingsFocus('payout')}
              onProfile={() => openSettingsFocus('company')}
            />
          )}
          <div key={section} className="lux-page-enter">
          {section === 'dashboard' && (
            <SupplierDashboard
              onNavigateToListings={() => handleNavigate('listings')}
              onNavigateToSettings={() => handleNavigate('business-profile')}
              onNavigateToBookings={() => handleNavigate('bookings')}
              showSupplierSetupBanner={false}
              supplierSetupDoneCount={onboardingDoneCount}
              supplierSetupNextLabel={onboardingNextLabel}
              onSupplierSetupNext={onboardingNextAction}
            />
          )}
          {section === 'listings' && <SupplierListings />}
          {section === 'bookings' && <SupplierBookings />}
          {section === 'earnings' && <SupplierEarnings />}
          {section === 'reviews' && <SupplierReviews />}
          {section === 'pickup' && <SupplierPickupPlanner />}
          {section === 'badges' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-semibold text-gray-900">Brand assets</h1>
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-2xl">
                <p className="text-sm text-gray-500">Configure your supplier trust badge for Traverion partner-facing use.</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={badgeEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setBadgeEnabled(enabled);
                      localStorage.setItem('supplier_badge_state', JSON.stringify({ enabled, variant: badgeVariant }));
                    }}
                    className="rounded border-gray-300 text-finland focus:ring-finland"
                  />
                  <span className="text-sm text-gray-800">Enable promotional badge</span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Badge style</label>
                  <select
                    value={badgeVariant}
                    onChange={(e) => {
                      const variant = e.target.value as BadgeVariant;
                      setBadgeVariant(variant);
                      localStorage.setItem('supplier_badge_state', JSON.stringify({ enabled: badgeEnabled, variant }));
                    }}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-finland"
                  >
                    <option value="gold">Gold partner</option>
                    <option value="verified">Verified operator</option>
                    <option value="trusted">Trusted host</option>
                  </select>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1">Preview</p>
                  <p className="text-sm font-medium text-gray-900">
                    {badgeEnabled ? `${badgeVariant === 'gold' ? 'Gold Partner' : badgeVariant === 'verified' ? 'Verified Operator' : 'Trusted Host'} · Traverion` : 'Badge disabled'}
                  </p>
                </div>
              </div>
            </div>
          )}
          {(section === 'business-profile' || section === 'account-settings') && (
            <SupplierSettingsPages
              variant={section === 'account-settings' ? 'account-settings' : 'business-profile'}
              user={user}
              isSupabase={isSupabase}
              supabase={supabase}
              supplierEmail={supplierEmail}
              supplierEmailVerified={supplierEmailVerified}
              verificationSending={verificationSending}
              verificationMessage={verificationMessage}
              setVerificationMessage={setVerificationMessage}
              setVerificationSending={setVerificationSending}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              passwordSaving={passwordSaving}
              passwordMessage={passwordMessage}
              setPasswordMessage={setPasswordMessage}
              setPasswordSaving={setPasswordSaving}
              handleNavigate={handleNavigate}
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
      </div>
    </div>
  );
}
