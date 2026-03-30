import { useState, useEffect, useCallback, type ReactNode } from 'react';
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
import { fetchMyListings } from '../../data/supabase-listings';
import SupplierLoginPage from './SupplierLoginPage';
import SupplierSettingsPages from './SupplierSettingsPages';
import {
  canManageTeam,
  canManageFinance,
  type SupplierRole,
} from '../../lib/supplierTeamRoles';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { upsertSupplierTeamMember, removeSupplierTeamMember } from '../../data/supabase-supplier-team';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { isSupplierBusinessProfileComplete, isSupplierPayoutConfigured } from '../../lib/supplierOnboarding';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';

/** URL path for the supplier login/landing page. Portal is /supplier and /supplier/* */
export const SUPPLIER_LOGIN_PATH = '/supplier-log-in';

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
  if (pathname === '/supplier' || pathname === '/supplier/') return 'dashboard';
  const match = pathname.match(/^\/supplier\/([a-z-]+)/);
  if (!match) return null;
  if (match[1] === 'settings') return 'business-profile';
  const section = match[1] as ExtraSupplierSection;
  return ROUTABLE_SECTIONS.includes(section) ? (section as SupplierSection) : 'dashboard';
}

function isSupplierLoginPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '');
  return p === SUPPLIER_LOGIN_PATH;
}

function isSupplierPortalPath(pathname: string): boolean {
  return pathname === '/supplier' || pathname === '/supplier/' || pathname.startsWith('/supplier/');
}

type SetupStripProps = {
  listingCount: number | null;
  hasPayout: boolean;
  verificationStatus: string;
  profileComplete: boolean;
  onListings: () => void;
  onPayout: () => void;
  onProfile: () => void;
};

function SupplierSetupProgressStrip({
  listingCount,
  hasPayout,
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

  const doneCount = [verified, hasPayout, hasListing].filter(Boolean).length;
  const steps = [verified, hasPayout, hasListing] as const;

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
              Flow: verify → bank (IBAN) → publish. Green only after Traverion approves.
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
              hasPayout,
              'emerald',
              onPayout,
              hasPayout ? (
                <CheckCircle2 className="text-emerald-600" aria-hidden />
              ) : (
                <Circle className="text-slate-400" aria-hidden />
              ),
              hasPayout ? 'Bank details saved' : 'Payment details',
              hasPayout ? 'IBAN + BIC on file.' : 'Add IBAN and BIC before publish.'
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
  const { role, members: roleMembers } = useSupplierRole();
  const [section, setSection] = useState<SupplierSection>(() => getSectionFromPath(window.location.pathname) ?? 'dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'bank' | 'paypal' | 'none' | ''>('');
  const [payoutIban, setPayoutIban] = useState('');
  const [payoutBic, setPayoutBic] = useState('');
  const [payoutPaypalEmail, setPayoutPaypalEmail] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<'success' | 'error' | null>(null);
  const [paymentCycle, setPaymentCycle] = useState<'monthly' | 'biweekly' | ''>('');
  const [payoutThreshold, setPayoutThreshold] = useState<string>('');
  const [businessType, setBusinessType] = useState<'company' | 'individual' | ''>('');
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState('');
  const [managingDirectors, setManagingDirectors] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [vatId, setVatId] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<string>('');
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('');
  const [insuranceCoverage, setInsuranceCoverage] = useState('');
  const [insuranceStart, setInsuranceStart] = useState('');
  const [insuranceEnd, setInsuranceEnd] = useState('');
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<'success' | 'error' | null>(null);
  const [teamLabel, setTeamLabel] = useState('');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [teamRole, setTeamRole] = useState<SupplierRole>('viewer');
  const [teamMembers, setTeamMembers] = useState(roleMembers);
  const [onboardingListingCount, setOnboardingListingCount] = useState<number | null>(null);
  const [onboardingHasPayout, setOnboardingHasPayout] = useState(false);
  const [onboardingHasCompany, setOnboardingHasCompany] = useState(false);
  /** Server verification_status for onboarding strip (independent of form state on other pages). */
  const [onboardingVerificationStatus, setOnboardingVerificationStatus] = useState('');
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

  const supplierEmail = typeof user?.email === 'string' ? user.email : '';
  const supplierEmailVerified = Boolean((user as { email_confirmed_at?: string | null } | null)?.email_confirmed_at);

  useEffect(() => {
    if ((section !== 'business-profile' && section !== 'account-settings') || !user?.id || !isSupabase) return;
    fetchSupplierProfile(user.id).then((p) => {
      if (p) {
        setProfileDisplayName(p.display_name ?? '');
        setPayoutMethod((p.payout_method as 'bank' | 'paypal' | 'none') ?? '');
        setPayoutIban(p.payout_iban ?? '');
        setPayoutBic(p.payout_bic ?? '');
        setPayoutPaypalEmail(p.payout_paypal_email ?? '');
        setPaymentCycle(p.payment_cycle ?? '');
        setPayoutThreshold(String(p.payout_threshold_min ?? ''));
        setBusinessType(p.business_type ?? '');
        setCompanyLegalName(p.company_legal_name ?? '');
        setCompanyRegistrationNumber(p.company_registration_number ?? '');
        setManagingDirectors(p.managing_directors ?? '');
        setBusinessAddress(p.business_address ?? '');
        setTaxId(p.tax_id ?? '');
        setVatId(p.vat_id ?? '');
        setVerificationStatus(p.verification_status ?? '');
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
      setOnboardingVerificationStatus('');
      return;
    }
    const [profile, listings] = await Promise.all([
      fetchSupplierProfile(user.id),
      fetchMyListings(user.id),
    ]);
    setOnboardingListingCount(listings.length);
    setOnboardingHasPayout(isSupplierPayoutConfigured(profile));
    setOnboardingHasCompany(isSupplierBusinessProfileComplete(profile));
    setOnboardingVerificationStatus((profile?.verification_status ?? '').trim());
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
    setTeamMembers(roleMembers);
  }, [roleMembers]);

  useEffect(() => {
    const syncFromPath = () => {
      const s = getSectionFromPath(window.location.pathname);
      if (s) setSection(s);
    };
    syncFromPath();
    window.addEventListener('popstate', syncFromPath);
    return () => window.removeEventListener('popstate', syncFromPath);
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

  const fillPrivacyTemplate = () => {
    const raw = applyLegalDate(defaultPrivacyPolicyTemplate());
    setPrivacyPolicyText(
      applyLegalPlaceholders(raw, {
        operatorName: operatorDisplayName,
        businessAddress: businessAddress,
      })
    );
  };

  const fillTermsTemplate = () => {
    const raw = applyLegalDate(defaultTermsConditionsTemplate());
    setTermsConditionsText(
      applyLegalPlaceholders(raw, {
        operatorName: operatorDisplayName,
        businessAddress: businessAddress,
      })
    );
  };

  const handleNavigate = (s: SupplierSection) => {
    setSection(s);
    const path = s === 'dashboard' ? '/supplier' : `/supplier/${s}`;
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
    window.location.replace('/supplier');
  };

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const onLoginPath = isSupplierLoginPath(pathname);
  const onPortalPath = isSupplierPortalPath(pathname);
  const onboardingHasListing = onboardingListingCount !== null && onboardingListingCount > 0;
  const onboardingBusinessVerified = onboardingVerificationStatus.trim().toLowerCase() === 'verified';
  const onboardingDoneCount = [onboardingHasListing, onboardingHasPayout, onboardingBusinessVerified].filter(Boolean)
    .length;
  const onboardingComplete = onboardingDoneCount === 3;
  const onboardingNextLabel =
    !onboardingBusinessVerified
      ? onboardingVerificationStatus.trim().toLowerCase() === 'rejected'
        ? 'Update profile after rejection'
        : onboardingHasCompany &&
            ['pending', ''].includes(onboardingVerificationStatus.trim().toLowerCase())
          ? 'Verification in progress'
          : 'Complete business profile'
      : !onboardingHasPayout
        ? 'Add bank details (IBAN + BIC)'
        : !onboardingHasListing
          ? 'Publish your first listing'
          : 'Open business profile';
  const onboardingNextAction =
    !onboardingBusinessVerified
      ? () => openSettingsFocus('company')
      : !onboardingHasPayout
        ? () => openSettingsFocus('payout')
        : !onboardingHasListing
          ? () => handleNavigate('listings')
          : () => handleNavigate('business-profile');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
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
    window.location.replace('/supplier');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Redirecting...</p>
      </div>
    );
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
              hasPayout={onboardingHasPayout}
              verificationStatus={onboardingVerificationStatus}
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
              role={role}
              isSupabase={isSupabase}
              supabase={supabase}
              supplierEmail={supplierEmail}
              supplierEmailVerified={supplierEmailVerified}
              verificationSending={verificationSending}
              verificationMessage={verificationMessage}
              setVerificationMessage={setVerificationMessage}
              setVerificationSending={setVerificationSending}
              publicSiteBaseUrl={publicSiteBaseUrl}
              teamMembers={teamMembers}
              teamLabel={teamLabel}
              setTeamLabel={setTeamLabel}
              teamMemberId={teamMemberId}
              setTeamMemberId={setTeamMemberId}
              teamRole={teamRole}
              setTeamRole={setTeamRole}
              setTeamMembers={setTeamMembers}
              canManageTeam={canManageTeam}
              removeSupplierTeamMember={removeSupplierTeamMember}
              upsertSupplierTeamMember={upsertSupplierTeamMember}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              passwordSaving={passwordSaving}
              passwordMessage={passwordMessage}
              setPasswordMessage={setPasswordMessage}
              setPasswordSaving={setPasswordSaving}
              handleNavigate={handleNavigate}
              businessProfileTab={businessProfileTab}
              setBusinessProfileTab={setBusinessProfileTab}
              payoutMethod={payoutMethod}
              setPayoutMethod={setPayoutMethod}
              payoutIban={payoutIban}
              setPayoutIban={setPayoutIban}
              payoutBic={payoutBic}
              setPayoutBic={setPayoutBic}
              payoutPaypalEmail={payoutPaypalEmail}
              setPayoutPaypalEmail={setPayoutPaypalEmail}
              paymentCycle={paymentCycle}
              setPaymentCycle={setPaymentCycle}
              payoutThreshold={payoutThreshold}
              setPayoutThreshold={setPayoutThreshold}
              payoutSaving={payoutSaving}
              payoutMessage={payoutMessage}
              setPayoutSaving={setPayoutSaving}
              setPayoutMessage={setPayoutMessage}
              updateSupplierPayout={updateSupplierPayout}
              canManageFinance={canManageFinance}
              businessType={businessType}
              setBusinessType={setBusinessType}
              companyLegalName={companyLegalName}
              setCompanyLegalName={setCompanyLegalName}
              companyRegistrationNumber={companyRegistrationNumber}
              setCompanyRegistrationNumber={setCompanyRegistrationNumber}
              managingDirectors={managingDirectors}
              setManagingDirectors={setManagingDirectors}
              businessAddress={businessAddress}
              setBusinessAddress={setBusinessAddress}
              taxId={taxId}
              setTaxId={setTaxId}
              vatId={vatId}
              setVatId={setVatId}
              verificationStatus={verificationStatus}
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
              businessProfileComplete={onboardingHasCompany}
              onCompanyProfileSaved={() => {
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
