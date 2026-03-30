import { useState, useEffect } from 'react';
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
  const [settingsListingsCount, setSettingsListingsCount] = useState<number | null>(null);
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
  const [identityDocumentPath, setIdentityDocumentPath] = useState('');
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
        setIdentityDocumentPath((p.identity_document_path ?? '').trim());
        setCompanyRegistrationPath((p.company_registration_document_path ?? '').trim());
      }
    });
  }, [section, user?.id, isSupabase]);

  useEffect(() => {
    const loadOnboardingSignals = async () => {
      if (!user?.id || !isSupabase) {
        setOnboardingListingCount(0);
        setOnboardingHasPayout(false);
        setOnboardingHasCompany(false);
        return;
      }
      const [profile, listings] = await Promise.all([
        fetchSupplierProfile(user.id),
        fetchMyListings(user.id),
      ]);
      setOnboardingListingCount(listings.length);
      setOnboardingHasPayout(isSupplierPayoutConfigured(profile));
      setOnboardingHasCompany(isSupplierBusinessProfileComplete(profile));
    };
    loadOnboardingSignals();
  }, [user?.id, isSupabase, section]);

  useEffect(() => {
    if ((section !== 'business-profile' && section !== 'account-settings') || !user?.id || !isSupabase) return;
    fetchMyListings(user.id)
      .then((rows) => setSettingsListingsCount(rows.length))
      .catch(() => setSettingsListingsCount(0));
  }, [section, user?.id, isSupabase]);

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
  const onboardingDoneCount = [onboardingListingCount !== null && onboardingListingCount > 0, onboardingHasPayout, onboardingHasCompany].filter(Boolean).length;
  const onboardingComplete = onboardingDoneCount === 3;
  const onboardingNextLabel =
    onboardingListingCount !== null && onboardingListingCount <= 0
      ? 'Publish your first listing'
      : !onboardingHasPayout
        ? 'Add payout details'
        : !onboardingHasCompany
          ? 'Complete business profile'
          : 'Open business profile';
  const onboardingNextAction =
    onboardingListingCount !== null && onboardingListingCount <= 0
      ? () => handleNavigate('listings')
      : !onboardingHasPayout
        ? () => openSettingsFocus('payout')
        : !onboardingHasCompany
          ? () => openSettingsFocus('company')
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
    <div className="min-h-screen bg-gray-50 flex">
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
        className={`lg:hidden fixed top-0 left-0 w-64 h-full bg-white border-r border-gray-200 z-50 transform transition-transform duration-250 ease-out-smooth ${
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
        <nav className="p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                handleNavigate(item.id);
                setSidebarOpen(false);
              }}
              className={`lux-flat w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors duration-300 ease-lux ${
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
        <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-20 h-16 flex items-center px-4 sm:px-6 lg:px-8 supports-[backdrop-filter]:bg-white/90 transition-shadow duration-500 ease-lux relative">
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
          <div className="lg:hidden fixed inset-0 z-50 bg-white">
            <div className="h-16 px-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Account</h2>
              <button type="button" onClick={() => setMobileAccountOpen(false)} className="p-2 rounded-lg text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <p className="px-1 pt-1 pb-2 text-xs uppercase tracking-wide text-gray-500">Traverion supplier account</p>
              <button type="button" onClick={() => openSettingsFocus('company')} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200">Business profile</button>
              <button type="button" onClick={() => openSettingsFocus('legal')} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200">Legal obligations</button>
              <button type="button" onClick={() => openSettingsFocus('account')} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200">Account settings</button>
              <button type="button" onClick={() => openSettingsFocus('security')} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200">Security and password</button>
              <button type="button" onClick={() => handleNavigate('badges')} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200">Brand assets</button>
              <button type="button" onClick={() => signOut()} className="w-full text-left px-4 py-3 rounded-xl border border-red-200 text-red-600">Log out</button>
            </div>
          </div>
        )}
        <main className="p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div key={section} className="lux-page-enter">
          {section === 'dashboard' && (
            <SupplierDashboard
              onNavigateToListings={() => handleNavigate('listings')}
              onNavigateToSettings={() => handleNavigate('business-profile')}
              onNavigateToBookings={() => handleNavigate('bookings')}
              showSupplierSetupBanner={!onboardingComplete}
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
              settingsListingsCount={settingsListingsCount}
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
              identityDocumentPath={identityDocumentPath}
              setIdentityDocumentPath={setIdentityDocumentPath}
              companyRegistrationPath={companyRegistrationPath}
              setCompanyRegistrationPath={setCompanyRegistrationPath}
              setVerificationStatus={setVerificationStatus}
              businessProfileComplete={onboardingHasCompany}
              onCompanyProfileSaved={() => setOnboardingHasCompany(true)}
            />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
