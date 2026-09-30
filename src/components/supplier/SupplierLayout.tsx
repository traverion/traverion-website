import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  LayoutDashboard,
  MapPin,
  Calendar,
  X,
  UserCircle2,
  Wallet,
  Plus,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { supabase } from '../../lib/supabase';
import SupplierDashboard from '../../pages/supplier/SupplierDashboard';
import SupplierListings from '../../pages/supplier/SupplierListings';
import SupplierBookings from '../../pages/supplier/SupplierBookings';
import SupplierAvailability from '../../pages/supplier/SupplierAvailability';
import PartnerAuthPage from './PartnerAuthPage';
import PartnerLandingPage from './PartnerLandingPage';
import PartnerSidebar from './PartnerSidebar';
import { PARTNER_MORE_GROUPS, PARTNER_SIDEBAR_FOOTER, PARTNER_SIDEBAR_PRIMARY } from '../../lib/partnerNav';
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
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { isSupplierBusinessProfileComplete, isSupplierPayoutConfigured } from '../../lib/supplierOnboarding';
import {
  supplierOwnsAnyListing,
  userCanAccessPartnerPortal,
  userHasSupplierProfile,
} from '../../lib/supplierPortalAccess';
import { isPartnerMarketingPathForCurrentHost } from '../../lib/partnerHost';
import {
  PARTNER_APP_BASE,
  PARTNER_CREATE_PATH,
  PARTNER_EMAIL_VERIFIED_PATH,
  PARTNER_HELP_PATH,
  PARTNER_LANDING_DEV_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_RESET_PASSWORD_PATH,
  PARTNER_RESERVATIONS_PATH,
  PARTNER_SIGNUP_PATH,
  partnerMarketingPageFromPathname,
} from '../../lib/partnerPortalPaths';
import PartnerMarketingStaticPage from './PartnerMarketingStaticPage';
import PartnerEmailVerifiedPage from './PartnerEmailVerifiedPage';
import PartnerResetPasswordPage from './PartnerResetPasswordPage';
import { fetchConsumerProfile } from '../../data/supabase-consumer-profile';
import { partnerSignInTravelerOnlyEmailError } from '../../lib/customerSupplierAuthMessages';
import { setPartnerAuthFlash } from '../../lib/partnerAuthFlash';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import ErrorState from '../ErrorState';
import SkipLink from '../SkipLink';
import { pathEquals, replaceHrefIfChanged, replacePathIfChanged } from '../../lib/authNavigation';
import { partnerRedirectForSession } from '../../lib/partnerAuthState';
import { appStripeIsTestMode } from '../../lib/money';
import { PARTNER_PRIMARY_NAV_SECTION_IDS } from '../../lib/partner-primary-nav';
import {
  consumePartnerReturnPath,
  peekPartnerReturnPath,
  rememberPartnerReturnPath,
} from '../../lib/partnerReturnPath';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

const SupplierEarnings = lazy(() => import('../../pages/supplier/SupplierEarnings'));
const SupplierPerformance = lazy(() => import('../../pages/supplier/SupplierPerformance'));
const SupplierInbox = lazy(() => import('../../pages/supplier/SupplierInbox'));
const SupplierReviews = lazy(() => import('../../pages/supplier/SupplierReviews'));
const SupplierPickupPlanner = lazy(() => import('../../pages/supplier/SupplierPickupPlanner'));
const SupplierDiscountsOffers = lazy(() => import('../../pages/supplier/SupplierDiscountsOffers'));
const SupplierChangePassword = lazy(() => import('../../pages/supplier/SupplierChangePassword'));
const PartnerOnboarding = lazy(() => import('../../pages/supplier/PartnerOnboarding'));
const PartnerCreateListingPage = lazy(() => import('../../pages/supplier/PartnerCreateListingPage'));
const PartnerHelpPage = lazy(() => import('../../pages/supplier/PartnerHelpPage'));
const SupplierSettingsPages = lazy(() => import('./SupplierSettingsPages'));

function PartnerSectionFallback() {
  return (
    <div className="py-2" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-48 rounded-lg bg-black/[0.06] animate-pulse" />
      <div className="mt-3 h-4 w-full max-w-md rounded bg-black/[0.04] animate-pulse" />
      <div className="mt-10 space-y-4">
        <div className="h-20 rounded-2xl bg-black/[0.04] animate-pulse" />
        <div className="h-20 rounded-2xl bg-black/[0.04] animate-pulse" />
        <div className="h-20 rounded-2xl bg-black/[0.04] animate-pulse" />
      </div>
    </div>
  );
}

function PartnerBusyScreen({ label }: { label: string }) {
  return (
    <div className="partner-busy-screen min-h-screen" aria-busy="true" aria-label={label}>
      <p className="sr-only">{label}</p>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 pb-16">
        <div className="inline-flex items-center gap-2 rounded-md bg-finland/10 px-3 py-2 ring-1 ring-finland/15">
          <div className="h-6 w-6 rounded-md bg-finland/25 animate-pulse" aria-hidden />
          <div className="h-3 w-24 rounded bg-black/[0.06] animate-pulse" aria-hidden />
        </div>
        <div className="mt-10 max-w-xl">
          <div className="h-10 w-56 max-w-full rounded-md bg-black/[0.06] animate-pulse" />
          <div className="mt-3 h-4 w-72 max-w-full rounded bg-black/[0.04] animate-pulse" />
        </div>
        <div className="mt-10 space-y-3">
          <div className="tv-card h-24 animate-pulse" />
          <div className="tv-card h-24 animate-pulse" />
          <div className="tv-card h-24 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

type PartnerProfileGate =
  | { kind: 'pending'; forUserId: string }
  | { kind: 'resolved'; forUserId: string; allowed: boolean }
  | { kind: 'failed'; forUserId: string };

/** @deprecated Use PARTNER_LOGIN_PATH from partnerPortalPaths */
export const SUPPLIER_LOGIN_PATH = PARTNER_LOGIN_PATH;

type SupplierSection =
  | 'dashboard'
  | 'create'
  | 'onboarding'
  | 'listings'
  | 'availability'
  | 'bookings'
  | 'reservations'
  | 'inbox'
  | 'earnings'
  | 'discounts'
  | 'reviews'
  | 'pickup'
  | 'performance'
  | 'help'
  | 'business-profile'
  | 'account-settings'
  | 'change-password';
type AccountShortcutTarget = 'company' | 'legal' | 'account' | 'security' | 'payout';
type BusinessProfileTab = 'company' | 'legal';

/**
 * Mobile bottom-tab nav. Fixed at 5 slots — a phone's thumb-reachable bar has no room
 * for more without crowding. Income must be one tap away.
 * Kept in sync with PARTNER_PRIMARY_NAV_SECTION_IDS below (guard throws if they drift).
 */
const PRIMARY_NAV: { id: SupplierSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'listings', label: 'Listings', icon: MapPin },
  { id: 'earnings', label: 'Income', icon: Wallet },
];

if (
  PARTNER_PRIMARY_NAV_SECTION_IDS.length !== PRIMARY_NAV.length ||
  PARTNER_PRIMARY_NAV_SECTION_IDS.some((id, i) => PRIMARY_NAV[i]?.id !== id)
) {
  throw new Error('PRIMARY_NAV out of sync with PARTNER_PRIMARY_NAV_SECTION_IDS');
}

const PATH_ALIASES: Record<string, SupplierSection> = {
  today: 'dashboard',
  home: 'dashboard',
  tours: 'listings',
  calendar: 'availability',
  money: 'earnings',
  income: 'earnings',
  listings: 'listings',
  availability: 'availability',
  bookings: 'bookings',
  reservations: 'reservations',
  create: 'create',
  inbox: 'inbox',
  account: 'account-settings',
  earnings: 'earnings',
  discounts: 'discounts',
  offers: 'discounts',
  reviews: 'reviews',
  pickup: 'pickup',
  performance: 'performance',
  analytics: 'performance',
  'business-profile': 'business-profile',
  'account-settings': 'account-settings',
  'change-password': 'change-password',
  onboarding: 'onboarding',
  dashboard: 'dashboard',
  help: 'help',
};

function pathForSection(s: SupplierSection): string {
  if (s === 'dashboard') return PARTNER_APP_BASE;
  if (s === 'listings') return `${PARTNER_APP_BASE}/listings`;
  if (s === 'availability') return `${PARTNER_APP_BASE}/calendar`;
  if (s === 'earnings') return `${PARTNER_APP_BASE}/money`;
  if (s === 'create') return PARTNER_CREATE_PATH;
  if (s === 'reservations') return PARTNER_RESERVATIONS_PATH;
  if (s === 'help') return PARTNER_HELP_PATH;
  return `${PARTNER_APP_BASE}/${s}`;
}

function getSectionFromPath(pathname: string): SupplierSection | null {
  const base = PARTNER_APP_BASE;
  if (pathname === base || pathname === `${base}/`) return 'dashboard';
  const match = pathname.match(new RegExp(`^${base}/([a-z-]+)`));
  if (!match) return null;
  if (match[1] === 'settings') return 'business-profile';
  const aliased = PATH_ALIASES[match[1]];
  if (aliased) return aliased;
  return null;
}

function isSupplierLoginPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  return p === PARTNER_LOGIN_PATH || p === PARTNER_SIGNUP_PATH;
}

function isPartnerLandingPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === PARTNER_LANDING_DEV_PATH) return true;
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'partner.traverion.com' && (p === '/' || p === '');
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
  // Phase 1755: Create listing CTA is editor-only (matches listings write RLS).
  const { role } = useSupplierRole();
  const canCreateListings = canManageBookings(role);
  const [partnerProfileGate, setPartnerProfileGate] = useState<PartnerProfileGate | null>(null);
  const [partnerGateRetryKey, setPartnerGateRetryKey] = useState(0);
  const blockedRedirectStarted = useRef(false);
  const hadPartnerSessionRef = useRef(false);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const mobileAccountRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  useDialogFocus(mobileAccountOpen, mobileAccountRef, () => setMobileAccountOpen(false));
  useDialogFocus(accountMenuOpen, accountMenuRef, () => setAccountMenuOpen(false));
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
  const [unknownPartnerPath, setUnknownPartnerPath] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const partnerHubUserIdRef = useRef<string | null>(null);
  const partnerProfileGenRef = useRef(0);

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
        // Phase 1201: allow team JWTs without inventing a supplier_profiles row.
        const ok = await userCanAccessPartnerPortal(client, uid);
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
            const afterRepair = await userCanAccessPartnerPortal(client, uid);
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
      const last = await userCanAccessPartnerPortal(client, uid);
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
    if (user && partnerGateView === 'allowed') hadPartnerSessionRef.current = true;
  }, [user, partnerGateView]);

  useEffect(() => {
    if (loading || signingOut) return;
    if (partnerGateView === 'blocked') return;
    const kind =
      !user ? 'anon'
      : partnerGateView === 'checking' ? 'checking-profile'
      : partnerGateView === 'error' ? 'error'
      : partnerGateView === 'allowed' ? 'partner'
      : 'unknown';
    const pathname = window.location.pathname;
    const returnPath = peekPartnerReturnPath();
    if (kind === 'anon' && isSupplierPortalPath(pathname)) {
      rememberPartnerReturnPath(pathname, window.location.search);
      if (hadPartnerSessionRef.current) {
        setPartnerAuthFlash({
          message: 'Your session ended. Sign in to continue where you left off.',
          tab: 'signin',
        });
      }
    }
    const dest = partnerRedirectForSession({
      kind,
      pathname,
      hostname: window.location.hostname,
      returnPath,
    });
    if (kind === 'partner' && returnPath) {
      const returnPathname = returnPath.split('?')[0] ?? returnPath;
      if (pathEquals(pathname, returnPathname)) consumePartnerReturnPath();
    }
    if (dest) replaceHrefIfChanged(dest);
  }, [loading, user, partnerGateView, signingOut]);

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
      replacePathIfChanged(PARTNER_LOGIN_PATH);
    })();
  }, [partnerGateView, user?.id, user?.email, signOut]);

  useLayoutEffect(() => {
    const clearPartnerWorkspaceProfileState = () => {
      setProfileDisplayName('');
      setPayoutIban('');
      setPayoutBic('');
      setPayoutVerificationStatus('');
      setPayoutVerificationSubmittedAt('');
      setBusinessVerificationFeedback('');
      setPayoutVerificationFeedback('');
      setPaymentCycle('');
      setPayoutThreshold('');
      setBusinessType('');
      setBusinessTypeAtLastFetch('');
      setCompanyLegalName('');
      setCompanyRegistrationNumber('');
      setManagingDirectors('');
      setAddressStreet('');
      setAddressCountry('');
      setAddressCity('');
      setAddressPostalCode('');
      setTaxId('');
      setVatId('');
      setVerificationStatus('');
      setVerificationSubmittedAt('');
      setInsurancePolicyNumber('');
      setInsuranceCoverage('');
      setInsuranceStart('');
      setInsuranceEnd('');
      setInsuranceProvider('');
      setPrivacyPolicyText('');
      setTermsConditionsText('');
      setBusinessLogoUrl('');
      setCompanyRegistrationPath('');
      setPayoutMessage(null);
      setCompanyMessage(null);
      setLegalMessage(null);
    };
    if (!user?.id) {
      partnerHubUserIdRef.current = null;
      partnerProfileGenRef.current += 1;
      clearPartnerWorkspaceProfileState();
      return;
    }
    // Phase 1382 + layout: clear prior partner PII before paint on account switch (Account hub 1378 parity).
    if (partnerHubUserIdRef.current !== user.id) {
      partnerHubUserIdRef.current = user.id;
      partnerProfileGenRef.current += 1;
      clearPartnerWorkspaceProfileState();
    }
  }, [user?.id]);

  useEffect(() => {
    if ((section !== 'business-profile' && section !== 'account-settings') || !user?.id || !isSupabase) return;
    const uid = user.id;
    const gen = partnerProfileGenRef.current;
    fetchSupplierProfile(uid).then((p) => {
      if (gen !== partnerProfileGenRef.current) return;
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
      setOnboardingListingCount(null);
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
    const uid = user.id;
    const gen = partnerProfileGenRef.current;
    try {
      const [profile, listings] = await Promise.all([
        fetchSupplierProfile(uid),
        fetchMyListings(uid),
      ]);
      if (gen !== partnerProfileGenRef.current) return;
      setOnboardingListingCount(listings.length);
      setOnboardingHasPayout(isSupplierPayoutConfigured(profile));
      setOnboardingHasCompany(isSupplierBusinessProfileComplete(profile));
      setProfileDisplayName((profile?.display_name ?? '').trim());
      setCompanyLegalName((profile?.company_legal_name ?? '').trim());
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
    } catch {
      if (gen !== partnerProfileGenRef.current) return;
      setOnboardingListingCount(null);
    }
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
      const pathname = window.location.pathname;
      const s = getSectionFromPath(pathname);
      if (s) {
        setSection(s);
        setUnknownPartnerPath(false);
      } else if (isSupplierPortalPath(pathname)) {
        setUnknownPartnerPath(true);
      } else {
        setUnknownPartnerPath(false);
      }
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

  useEffect(() => {
    mainPaneRef.current?.scrollTo({ top: 0 });
  }, [section]);

  const handleNavigate = (s: SupplierSection) => {
    setUnknownPartnerPath(false);
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
    const ret = peekPartnerReturnPath();
    if (ret) {
      const pathOnly = ret.split('?')[0] ?? PARTNER_APP_BASE;
      setSection(getSectionFromPath(pathOnly) ?? 'dashboard');
      replaceHrefIfChanged(ret);
      return;
    }
    setSection('dashboard');
    replacePathIfChanged(PARTNER_APP_BASE);
  };

  const handlePartnerSignOut = () => {
    if (signingOut) return;
    hadPartnerSessionRef.current = false;
    consumePartnerReturnPath();
    setSigningOut(true);
    setAccountMenuOpen(false);
    setMobileAccountOpen(false);
    void signOut().finally(() => {
      window.location.replace(PARTNER_LOGIN_PATH);
    });
  };

  void pathEpoch;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const onLoginPath = isSupplierLoginPath(pathname);
  const onLandingPath = isPartnerLandingPath(pathname);
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

  if (loading || signingOut) {
    return <PartnerBusyScreen label={signingOut ? 'Signing out' : 'Loading partner workspace'} />;
  }

  if (partnerMarketingPage && isPartnerMarketingPathForCurrentHost(pathname)) {
    return <PartnerMarketingStaticPage pageId={partnerMarketingPage} />;
  }

  if (onLandingPath && !user) {
    return <PartnerLandingPage />;
  }

  if (onLandingPath && user && partnerGateView === 'allowed') {
    return <PartnerBusyScreen label="Opening partner workspace" />;
  }

  if (onPortalPath && !user) {
    return <PartnerBusyScreen label="Redirecting to login" />;
  }

  if (onLoginPath && user) {
    if (partnerGateView === 'checking' || partnerGateView === 'blocked') {
      return (
        <PartnerBusyScreen
          label={partnerGateView === 'blocked' ? 'Redirecting to sign in' : 'Checking partner account'}
        />
      );
    }
    if (partnerGateView === 'error') {
      return (
        <div className="min-h-screen bg-paper flex items-center justify-center px-4">
          <ErrorState
            title="Partner account unavailable"
            body="We could not verify your partner account. Check your connection and try again."
            retry={{ onClick: () => setPartnerGateRetryKey((k) => k + 1) }}
            extra={
              <button type="button" onClick={handlePartnerSignOut} className="tv-btn-ghost">
                Sign out
              </button>
            }
          />
        </div>
      );
    }
    if (partnerGateView === 'allowed') {
      return <PartnerBusyScreen label="Opening partner workspace" />;
    }
  }

  const needsPartnerProfileGate = Boolean(user && onPortalPath);
  if (needsPartnerProfileGate) {
    if (partnerGateView === 'checking') {
      return <PartnerBusyScreen label="Checking partner account" />;
    }
    if (partnerGateView === 'error') {
      return (
        <div className="min-h-screen bg-paper flex items-center justify-center px-4">
          <ErrorState
            title="Partner account unavailable"
            body="We could not verify your partner account. Check your connection and try again."
            retry={{ onClick: () => setPartnerGateRetryKey((k) => k + 1) }}
            extra={
              <button type="button" onClick={handlePartnerSignOut} className="tv-btn-ghost">
                Sign out
              </button>
            }
          />
        </div>
      );
    }
    if (partnerGateView === 'blocked') {
      return <PartnerBusyScreen label="Redirecting to sign in" />;
    }
  }

  if (onLoginPath && !user) {
    const p = pathname.replace(/\/$/, '') || '/';
    return (
      <PartnerAuthPage
        mode={p === PARTNER_SIGNUP_PATH ? 'signup' : 'signin'}
        onAuthenticated={handleAuthenticated}
        isSupabase={isSupabase}
      />
    );
  }

  return (
    <div className="partner-app-shell text-slate-900">
      <SkipLink />
      {appStripeIsTestMode() ? (
        <div className="partner-test-banner px-4 py-1.5 text-center sm:px-6" role="status">
          <p className="text-[12px] leading-snug">
            <span className="font-semibold uppercase tracking-[0.12em]">Test mode</span>
            <span className="mx-2 font-medium opacity-60" aria-hidden>
              ·
            </span>
            <span className="font-medium">Payments and Money are sandbox data — no live charges.</span>
          </p>
        </div>
      ) : null}

      <div className="partner-workspace">
        <PartnerSidebar
          primary={PARTNER_SIDEBAR_PRIMARY}
          footer={PARTNER_SIDEBAR_FOOTER}
          activeSection={section}
          businessLabel={operatorDisplayName}
          onNavigate={(id) => handleNavigate(id as SupplierSection)}
          onHome={() => handleNavigate('dashboard')}
          onCreate={() => handleNavigate('create')}
          showFinishSetup={!onboardingComplete}
          onFinishSetup={() => handleNavigate('onboarding')}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="partner-main-pane" ref={mainPaneRef}>
          <header className="partner-topbar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
            <div className="flex h-12 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={() => handleNavigate('dashboard')}
                className="lux-flat md:hidden flex items-center gap-2 shrink-0"
                aria-label="Partner home"
              >
                <img src={BRAND_LOGO_SRC} alt="" className="h-7 w-7 object-contain" />
                <span className="font-sans text-[10px] font-semibold tracking-[0.18em] text-slate-800">TRAVERION</span>
              </button>
              <div className="hidden md:flex min-w-0 items-baseline gap-2.5">
                <p className="truncate text-[13.5px] font-semibold tracking-tight text-slate-900">{operatorDisplayName}</p>
                <p className="shrink-0 text-[12px] font-medium text-slate-400">Partner workspace</p>
              </div>
              <div className="relative ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  className="partner-nav-item lux-flat hidden md:inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200/80 bg-white pl-1 pr-2.5 hover:bg-slate-50"
                  aria-label="Account"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="dialog"
                  aria-controls="partner-account-menu"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-finland text-[10px] font-semibold text-white">
                    {(user?.email ?? user?.id ?? 'S').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[9rem] min-w-0 truncate text-[12.5px] font-medium text-slate-700" title={supplierEmail || undefined}>
                    {supplierEmail || 'Account'}
                  </span>
                </button>
                {accountMenuOpen && (
                  <div
                    id="partner-account-menu"
                    ref={accountMenuRef}
                    role="dialog"
                    aria-label="Account"
                    className="absolute right-0 top-12 w-64 rounded-lg bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80 p-1.5 z-50 origin-top-right motion-safe:animate-slide-down"
                  >
                    {supplierEmail ? (
                      <p className="px-2.5 py-2 text-xs text-slate-500 truncate border-b border-slate-100 mb-1 min-w-0" title={supplierEmail}>
                        {supplierEmail}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openSettingsFocus('account')}
                      className="partner-nav-item lux-flat w-full text-left px-2.5 py-2 rounded-md text-[13px] text-slate-700 hover:bg-slate-50"
                    >
                      Account settings
                    </button>
                    {!onboardingComplete && (
                      <button
                        type="button"
                        onClick={() => handleNavigate('onboarding')}
                        className="partner-nav-item lux-flat w-full text-left px-2.5 py-2 rounded-md text-[13px] text-slate-700 hover:bg-slate-50"
                      >
                        Finish setup
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handlePartnerSignOut}
                      className="partner-nav-item lux-flat w-full text-left px-2.5 py-2 rounded-md text-[13px] text-rose-700 hover:bg-rose-50"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {mobileAccountOpen && (
            <div
              ref={mobileAccountRef}
              className="md:hidden fixed inset-0 z-50 bg-white pt-[env(safe-area-inset-top)] motion-safe:animate-fade-in"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-more-title"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80">
                <h2 id="partner-more-title" className="text-[17px] font-semibold text-slate-900">More</h2>
                <button
                  type="button"
                  onClick={() => setMobileAccountOpen(false)}
                  className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-slate-500"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-4 pb-10 overflow-y-auto max-h-[calc(100dvh-3.5rem)]">
                <button
                  type="button"
                  onClick={() => handleNavigate('create')}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md bg-finland px-3 py-3 text-[15px] font-semibold text-white"
                  aria-label="Create listing"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  Create listing
                </button>
                {PARTNER_MORE_GROUPS.map((group) => (
                  <div key={group.id} className="pt-4">
                    <p className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{group.label}</p>
                    {group.items.map((item) => {
                      const active = section === item.id;
                      return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavigate(item.id as SupplierSection)}
                        aria-current={active ? 'page' : undefined}
                        className={`partner-nav-item lux-flat w-full flex items-center gap-3 text-left rounded-md px-2 py-3 text-[15px] ${
                          active ? 'bg-finland/[0.07] text-finland font-medium' : 'text-slate-700'
                        }`}
                      >
                        <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-finland' : 'text-slate-400'}`} strokeWidth={1.7} aria-hidden />
                        {item.label}
                      </button>
                      );
                    })}
                  </div>
                ))}
                <div className="pt-4">
                  <p className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Account</p>
                  {supplierEmail ? (
                    <p className="px-2 py-2 text-[13px] text-slate-500 truncate min-w-0" title={supplierEmail}>
                      {supplierEmail}
                    </p>
                  ) : null}
                  {!onboardingComplete && (
                    <button type="button" onClick={() => handleNavigate('onboarding')} className="partner-nav-item lux-flat w-full text-left rounded-md px-2 py-3 text-[15px] text-slate-700">
                      Finish setup
                    </button>
                  )}
                  <button type="button" onClick={handlePartnerSignOut} className="partner-nav-item lux-flat w-full text-left rounded-md px-2 py-3 text-[15px] text-rose-700">
                    Log out
                  </button>
                </div>
              </div>
            </div>
          )}

          <main
            id="main-content"
            tabIndex={-1}
            className={`mx-auto w-full min-w-0 flex-1 px-4 sm:px-6 lg:px-8 pt-5 pb-[max(1.5rem,calc(5.25rem+env(safe-area-inset-bottom)))] md:pb-12 outline-none ${
              section === 'availability'
                ? 'max-w-none'
                : section === 'dashboard'
                  ? 'max-w-[1120px]'
                  : 'max-w-6xl'
            }`}
          >
            <div className="lux-page-enter w-full min-w-0">
              <Suspense fallback={<PartnerSectionFallback />}>
                {unknownPartnerPath ? (
                  <div className="py-16 max-w-md">
                    <h1 className="font-display text-3xl text-ink">This page is not available</h1>
                    <p className="mt-3 text-ink-muted leading-relaxed">
                      That address is not a Partner workspace. Use Home, Listings, Bookings, or More.
                    </p>
                    <button type="button" className="tv-btn-primary mt-8" onClick={() => handleNavigate('dashboard')}>
                      Back to Today
                    </button>
                  </div>
                ) : (
                  <>
                    {section === 'onboarding' && (
                      <PartnerOnboarding
                        onSkip={() => handleNavigate('dashboard')}
                        onBusiness={() => openSettingsFocus('company')}
                        onPayout={() => openSettingsFocus('payout')}
                        onTours={() => {
                          if (onboardingHasListing) {
                            handleNavigate('listings');
                          } else {
                            navigateSupplierUrl(PARTNER_CREATE_PATH);
                          }
                        }}
                        businessDone={onboardingHasCompany}
                        payoutDone={onboardingHasPayout}
                        hasListing={onboardingHasListing}
                        publishReady={onboardingBusinessVerified && onboardingPayoutVerified}
                      />
                    )}
                    {section === 'dashboard' && <SupplierDashboard />}
                    {section === 'create' && <PartnerCreateListingPage />}
                    {section === 'listings' && <SupplierListings />}
                    {section === 'availability' && <SupplierAvailability />}
                    {section === 'bookings' && <SupplierBookings />}
                    {section === 'reservations' && <SupplierBookings inventoryFamily="stay" />}
                    {section === 'inbox' && <SupplierInbox />}
                    {section === 'earnings' && <SupplierEarnings />}
                    {section === 'discounts' && <SupplierDiscountsOffers />}
                    {section === 'reviews' && <SupplierReviews />}
                    {section === 'pickup' && <SupplierPickupPlanner />}
                    {section === 'performance' && <SupplierPerformance />}
                    {section === 'help' && <PartnerHelpPage />}
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
                  </>
                )}
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      <nav
        className="partner-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-slate-200/80"
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
                aria-current={active ? 'page' : undefined}
                className={`partner-nav-item lux-flat relative flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
                  active ? 'text-finland' : 'text-slate-400'
                }`}
              >
                {active ? (
                  <span className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-finland" aria-hidden />
                ) : null}
                <tab.icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.2 : 1.6} aria-hidden />
                <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileAccountOpen(true)}
            aria-expanded={mobileAccountOpen}
            aria-haspopup="dialog"
            aria-label="More"
            aria-current={
              !PRIMARY_NAV.some((tab) => tab.id === section) &&
              [
                'create',
                'inbox',
                'reviews',
                'discounts',
                'pickup',
                'availability',
                'reservations',
                'performance',
                'help',
                'business-profile',
                'account-settings',
                'onboarding',
                'change-password',
              ].includes(section)
                ? 'page'
                : undefined
            }
            className={`partner-nav-item lux-flat flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
              mobileAccountOpen ||
              ['create', 'inbox', 'reviews', 'discounts', 'pickup', 'availability', 'reservations', 'performance', 'help', 'business-profile', 'account-settings', 'onboarding', 'change-password'].includes(
                section
              )
                ? 'text-finland'
                : 'text-slate-400'
            }`}
          >
            <UserCircle2
              className="w-[18px] h-[18px]"
              strokeWidth={
                mobileAccountOpen ||
                ['create', 'inbox', 'reviews', 'discounts', 'pickup', 'availability', 'reservations', 'performance', 'help', 'business-profile', 'account-settings', 'onboarding', 'change-password'].includes(
                  section
                )
                  ? 2.2
                  : 1.6
              }
              aria-hidden
            />
            <span className="text-[10px] font-medium tracking-wide">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
