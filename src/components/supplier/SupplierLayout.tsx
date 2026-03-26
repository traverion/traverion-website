import { useState, useEffect } from 'react';
import { LayoutDashboard, MapPin, Calendar, DollarSign, Settings, LogOut, Globe, Menu, X, Users, BarChart3, Star, ClipboardList, Lock } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierDashboard from '../../pages/supplier/SupplierDashboard';
import SupplierListings from '../../pages/supplier/SupplierListings';
import SupplierBookings from '../../pages/supplier/SupplierBookings';
import SupplierEarnings from '../../pages/supplier/SupplierEarnings';
import SupplierReviews from '../../pages/supplier/SupplierReviews';
import SupplierPickupPlanner from '../../pages/supplier/SupplierPickupPlanner';
import { fetchSupplierProfile, updateSupplierPayout, updateSupplierCompanyProfile } from '../../data/supabase-supplier-profile';
import SupplierLoginPage from './SupplierLoginPage';
import SupplierNotificationCenter from './SupplierNotificationCenter';
import { loadSupplierNotifPrefs, saveSupplierNotifPrefs, type SupplierNotifPrefs } from '../../lib/supplierNotificationPrefs';
import {
  canManageTeam,
  canManageFinance,
  type SupplierRole,
} from '../../lib/supplierTeamRoles';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { upsertSupplierTeamMember, removeSupplierTeamMember } from '../../data/supabase-supplier-team';

/** URL path for the supplier login/landing page. Portal is /supplier and /supplier/* */
export const SUPPLIER_LOGIN_PATH = '/supplier-log-in';

type SupplierSection = 'dashboard' | 'listings' | 'bookings' | 'earnings' | 'reviews' | 'pickup' | 'settings';

const NAV_ITEMS: { id: SupplierSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'listings', label: 'My listings', icon: MapPin },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'pickup', label: 'Pickup planner', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function canAccessSection(role: SupplierRole, section: SupplierSection): boolean {
  if (role === 'owner') return true;
  if (role === 'manager') return section !== 'earnings';
  if (role === 'ops') return ['dashboard', 'bookings', 'pickup', 'reviews', 'settings'].includes(section);
  if (role === 'finance') return ['dashboard', 'earnings', 'settings'].includes(section);
  // viewer
  return ['dashboard', 'reviews'].includes(section);
}

function getSectionFromPath(pathname: string): SupplierSection | null {
  if (pathname === '/supplier' || pathname === '/supplier/') return 'dashboard';
  const match = pathname.match(/^\/supplier\/([a-z]+)/);
  if (!match) return null;
  const section = match[1] as SupplierSection;
  return NAV_ITEMS.some((n) => n.id === section) ? section : 'dashboard';
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
  const [notifPrefs, setNotifPrefs] = useState<SupplierNotifPrefs>(() => loadSupplierNotifPrefs());
  const [teamLabel, setTeamLabel] = useState('');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [teamRole, setTeamRole] = useState<SupplierRole>('viewer');
  const [teamMembers, setTeamMembers] = useState(roleMembers);

  useEffect(() => {
    if (section !== 'settings' || !user?.id || !isSupabase) return;
    fetchSupplierProfile(user.id).then((p) => {
      if (p) {
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
      }
    });
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
    if (!canAccessSection(role, section)) {
      setSection('dashboard');
      window.history.replaceState({}, '', '/supplier');
    }
  }, [role, section]);

  const handleNavigate = (s: SupplierSection) => {
    setSection(s);
    const path = s === 'dashboard' ? '/supplier' : `/supplier/${s}`;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setSidebarOpen(false);
  };

  const handleAuthenticated = () => {
    setSection('dashboard');
    window.location.replace('/supplier');
  };

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const onLoginPath = isSupplierLoginPath(pathname);
  const onPortalPath = isSupplierPortalPath(pathname);

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
            <Globe className="w-6 h-6 text-finland flex-shrink-0" />
            TRAVERION
          </button>
          <p className="text-xs text-gray-500 mt-0.5">Supplier portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                if (canAccessSection(role, item.id)) handleNavigate(item.id);
              }}
              disabled={!canAccessSection(role, item.id)}
              className={`lux-flat w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors duration-300 ease-lux ${
                section === item.id ? 'bg-finland/10 text-finland' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={!canAccessSection(role, item.id) ? `Restricted for role: ${role}` : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
              {!canAccessSection(role, item.id) && <Lock className="w-3.5 h-3.5 ml-auto text-gray-400" />}
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
            <Globe className="w-6 h-6 text-finland flex-shrink-0" />
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
                if (canAccessSection(role, item.id)) handleNavigate(item.id);
              }}
              disabled={!canAccessSection(role, item.id)}
              className={`lux-flat w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors duration-300 ease-lux ${
                section === item.id ? 'bg-finland/10 text-finland' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={!canAccessSection(role, item.id) ? `Restricted for role: ${role}` : undefined}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              {!canAccessSection(role, item.id) && <Lock className="w-3.5 h-3.5 ml-auto text-gray-400" />}
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
        <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-20 h-16 flex items-center px-4 sm:px-6 lg:px-8 supports-[backdrop-filter]:bg-white/90 transition-shadow duration-500 ease-lux">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="no-lux-interaction lux-tap-target lg:hidden p-2 -ml-2 text-gray-600 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <SupplierNotificationCenter />
            <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline" title="You are in the supplier portal">
              Supplier portal
            </span>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div key={section} className="lux-page-enter">
          {!canAccessSection(role, section) && (
            <div className="bg-white border border-amber-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900">Access restricted</h2>
              <p className="text-sm text-gray-600 mt-1">
                Your current role (<span className="font-medium">{role}</span>) does not have access to this section.
              </p>
            </div>
          )}
          {section === 'dashboard' && canAccessSection(role, section) && (
            <SupplierDashboard
              onNavigateToListings={() => handleNavigate('listings')}
              onNavigateToSettings={() => handleNavigate('settings')}
            />
          )}
          {section === 'listings' && canAccessSection(role, section) && <SupplierListings />}
          {section === 'bookings' && canAccessSection(role, section) && <SupplierBookings />}
          {section === 'earnings' && canAccessSection(role, section) && <SupplierEarnings />}
          {section === 'reviews' && canAccessSection(role, section) && <SupplierReviews />}
          {section === 'pickup' && canAccessSection(role, section) && <SupplierPickupPlanner />}
          {section === 'settings' && canAccessSection(role, section) && (
            <div className="space-y-6">
              <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Account</h2>
                  <p className="mt-1 text-gray-900">{user?.email ?? '—'}</p>
                  <p className="mt-1 text-xs text-gray-500">Current role: <span className="font-medium text-gray-700">{role}</span></p>
                </div>

                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Team & roles</h2>
                  <p className="text-sm text-gray-500 mb-4">Assign supplier roles to control who can manage bookings, operations, and finance.</p>
                  <div className="space-y-3 max-w-2xl">
                    {teamMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.label}</p>
                          <p className="text-xs text-gray-500 truncate">{m.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{m.role}</span>
                          {canManageTeam(role) && m.id !== (user?.id ?? 'local-supplier') && (
                            <button
                              type="button"
                              onClick={async () => {
                                const currentUserId = user?.id ?? 'local-supplier';
                                const ok = await removeSupplierTeamMember(currentUserId, m.id);
                                if (ok) {
                                  setTeamMembers((prev) => prev.filter((x) => x.id !== m.id));
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
                    {canManageTeam(role) ? (
                      <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Add member</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={teamLabel}
                            onChange={(e) => setTeamLabel(e.target.value)}
                            placeholder="Display name"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="text"
                            value={teamMemberId}
                            onChange={(e) => setTeamMemberId(e.target.value)}
                            placeholder="User id or email"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <select
                            value={teamRole}
                            onChange={(e) => setTeamRole(e.target.value as SupplierRole)}
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
                            const id = teamMemberId.trim();
                            if (!id) return;
                            const label = teamLabel.trim() || id;
                            const currentUserId = user?.id ?? 'local-supplier';
                            const ok = await upsertSupplierTeamMember(currentUserId, { id, label, role: teamRole });
                            if (ok) {
                              const next = [
                                ...teamMembers.filter((m) => m.id !== id),
                                { id, label, role: teamRole, createdAt: new Date().toISOString() },
                              ];
                              setTeamMembers(next);
                              setTeamLabel('');
                              setTeamMemberId('');
                              setTeamRole('viewer');
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

                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Notifications</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Control channels, urgency, and quiet hours for the header bell.
                  </p>
                  <div className="space-y-3 max-w-xl">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifPrefs.newBookings}
                        onChange={(e) => {
                          const next = { ...notifPrefs, newBookings: e.target.checked };
                          setNotifPrefs(next);
                          saveSupplierNotifPrefs(next);
                        }}
                        className="rounded border-gray-300 text-finland focus:ring-finland"
                      />
                      <span className="text-sm text-gray-800">Unacknowledged bookings</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifPrefs.reviewsNeedReply}
                        onChange={(e) => {
                          const next = { ...notifPrefs, reviewsNeedReply: e.target.checked };
                          setNotifPrefs(next);
                          saveSupplierNotifPrefs(next);
                        }}
                        className="rounded border-gray-300 text-finland focus:ring-finland"
                      />
                      <span className="text-sm text-gray-800">Reviews waiting for your reply</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Booking urgency</label>
                        <select
                          value={notifPrefs.bookingUrgency}
                          onChange={(e) => {
                            const next = { ...notifPrefs, bookingUrgency: e.target.value as 'all' | 'high_only' };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm"
                        >
                          <option value="all">All</option>
                          <option value="high_only">High only</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Review urgency</label>
                        <select
                          value={notifPrefs.reviewUrgency}
                          onChange={(e) => {
                            const next = { ...notifPrefs, reviewUrgency: e.target.value as 'all' | 'high_only' };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm"
                        >
                          <option value="all">All</option>
                          <option value="high_only">High only</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifPrefs.channelInApp}
                          onChange={(e) => {
                            const next = { ...notifPrefs, channelInApp: e.target.checked };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="rounded border-gray-300 text-finland focus:ring-finland"
                        />
                        <span className="text-sm text-gray-800">Channel: In-app bell</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifPrefs.channelEmail}
                          onChange={(e) => {
                            const next = { ...notifPrefs, channelEmail: e.target.checked };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="rounded border-gray-300 text-finland focus:ring-finland"
                        />
                        <span className="text-sm text-gray-800">Channel: Email notifications</span>
                      </label>
                    </div>
                    <div className="pt-1 border-t border-gray-100">
                      <label className="flex items-center gap-3 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={notifPrefs.quietHoursEnabled}
                          onChange={(e) => {
                            const next = { ...notifPrefs, quietHoursEnabled: e.target.checked };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="rounded border-gray-300 text-finland focus:ring-finland"
                        />
                        <span className="text-sm text-gray-800">Quiet hours</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-w-sm">
                        <input
                          type="time"
                          value={notifPrefs.quietHoursStart}
                          onChange={(e) => {
                            const next = { ...notifPrefs, quietHoursStart: e.target.value };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
                        />
                        <input
                          type="time"
                          value={notifPrefs.quietHoursEnd}
                          onChange={(e) => {
                            const next = { ...notifPrefs, quietHoursEnd: e.target.value };
                            setNotifPrefs(next);
                            saveSupplierNotifPrefs(next);
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        During quiet hours, in-app bell notifications are muted. Email delivery still depends on your
                        Resend + Edge Function setup.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Company profile</h2>
                  <p className="text-sm text-gray-500 mb-4">Business details for verification and invoicing.</p>
                  <div className="space-y-4 max-w-xl">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Business type</label>
                      <select
                        value={businessType}
                        onChange={(e) => setBusinessType(e.target.value as 'company' | 'individual' | '')}
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
                        value={companyLegalName}
                        onChange={(e) => setCompanyLegalName(e.target.value)}
                        placeholder="Legal or company name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                      />
                    </div>
                    {businessType === 'company' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Registration number</label>
                          <input
                            type="text"
                            value={companyRegistrationNumber}
                            onChange={(e) => setCompanyRegistrationNumber(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Managing directors</label>
                          <input
                            type="text"
                            value={managingDirectors}
                            onChange={(e) => setManagingDirectors(e.target.value)}
                            placeholder="Names"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Business address</label>
                      <textarea
                        value={businessAddress}
                        onChange={(e) => setBusinessAddress(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID (TIN)</label>
                        <input
                          type="text"
                          value={taxId}
                          onChange={(e) => setTaxId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">VAT ID (if registered)</label>
                        <input
                          type="text"
                          value={vatId}
                          onChange={(e) => setVatId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                        />
                      </div>
                    </div>
                    {verificationStatus && (
                      <p className="text-sm text-gray-600">Verification status: <span className="font-medium">{verificationStatus}</span></p>
                    )}
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Insurance (optional)</h3>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={insurancePolicyNumber}
                          onChange={(e) => setInsurancePolicyNumber(e.target.value)}
                          placeholder="Policy number"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                        />
                        <input
                          type="text"
                          value={insuranceCoverage}
                          onChange={(e) => setInsuranceCoverage(e.target.value)}
                          placeholder="Coverage details"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={insuranceStart}
                            onChange={(e) => setInsuranceStart(e.target.value)}
                            placeholder="Start"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                          />
                          <input
                            type="date"
                            value={insuranceEnd}
                            onChange={(e) => setInsuranceEnd(e.target.value)}
                            placeholder="End"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                          />
                        </div>
                        <input
                          type="text"
                          value={insuranceProvider}
                          onChange={(e) => setInsuranceProvider(e.target.value)}
                          placeholder="Provider name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={companySaving || !canManageFinance(role)}
                        onClick={async () => {
                          if (!user?.id) return;
                          setCompanySaving(true);
                          setCompanyMessage(null);
                          const res = await updateSupplierCompanyProfile(user.id, {
                            business_type: businessType || null,
                            company_legal_name: companyLegalName.trim() || null,
                            company_registration_number: companyRegistrationNumber.trim() || null,
                            managing_directors: managingDirectors.trim() || null,
                            business_address: businessAddress.trim() || null,
                            tax_id: taxId.trim() || null,
                            vat_id: vatId.trim() || null,
                            insurance_policy_number: insurancePolicyNumber.trim() || null,
                            insurance_coverage: insuranceCoverage.trim() || null,
                            insurance_start: insuranceStart || null,
                            insurance_end: insuranceEnd || null,
                            insurance_provider: insuranceProvider.trim() || null,
                          });
                          setCompanySaving(false);
                          setCompanyMessage(res.success ? 'success' : 'error');
                        }}
                        className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                      >
                        {companySaving ? 'Saving…' : 'Save company profile'}
                      </button>
                      {companyMessage === 'success' && <span className="text-sm text-green-600">Saved.</span>}
                      {companyMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Payout method</h2>
                  <p className="text-sm text-gray-500 mb-4">How you’d like to receive payouts when they’re enabled. This is stored securely and used when we integrate payments.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                      <select
                        value={payoutMethod}
                        onChange={(e) => setPayoutMethod(e.target.value as 'bank' | 'paypal' | 'none' | '')}
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      >
                        <option value="">Not set</option>
                        <option value="bank">Bank transfer (IBAN)</option>
                        <option value="paypal">PayPal</option>
                        <option value="none">None / later</option>
                      </select>
                    </div>
                    {payoutMethod === 'bank' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                          <input
                            type="text"
                            value={payoutIban}
                            onChange={(e) => setPayoutIban(e.target.value)}
                            placeholder="e.g. FI12 3456 7890 1234 56"
                            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">BIC / SWIFT</label>
                          <input
                            type="text"
                            value={payoutBic}
                            onChange={(e) => setPayoutBic(e.target.value)}
                            placeholder="e.g. NDEAFIHH"
                            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                          />
                        </div>
                      </>
                    )}
                    {payoutMethod === 'paypal' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">PayPal email</label>
                        <input
                          type="email"
                          value={payoutPaypalEmail}
                          onChange={(e) => setPayoutPaypalEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment cycle</label>
                      <select
                        value={paymentCycle}
                        onChange={(e) => setPaymentCycle(e.target.value as 'monthly' | 'biweekly' | '')}
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                      >
                        <option value="">Not set</option>
                        <option value="monthly">Monthly</option>
                        <option value="biweekly">Bi-weekly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Minimum payout threshold (e.g. 50)</label>
                      <input
                        type="number"
                        min={0}
                        value={payoutThreshold}
                        onChange={(e) => setPayoutThreshold(e.target.value)}
                        placeholder="0"
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={payoutSaving || !canManageFinance(role)}
                        onClick={async () => {
                          if (!user?.id) return;
                          setPayoutSaving(true);
                          setPayoutMessage(null);
                          const res = await updateSupplierPayout(user.id, {
                            payout_method: payoutMethod || null,
                            payout_iban: payoutMethod === 'bank' ? payoutIban.trim() || null : null,
                            payout_bic: payoutMethod === 'bank' ? payoutBic.trim() || null : null,
                            payout_paypal_email: payoutMethod === 'paypal' ? payoutPaypalEmail.trim() || null : null,
                            payment_cycle: paymentCycle || null,
                            payout_threshold_min: payoutThreshold !== '' ? Number(payoutThreshold) : null,
                          });
                          setPayoutSaving(false);
                          setPayoutMessage(res.success ? 'success' : 'error');
                        }}
                        className="px-4 py-2 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
                      >
                        {payoutSaving ? 'Saving…' : 'Save payout details'}
                      </button>
                      {payoutMessage === 'success' && <span className="text-sm text-green-600">Saved.</span>}
                      {payoutMessage === 'error' && <span className="text-sm text-red-600">Failed to save.</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
