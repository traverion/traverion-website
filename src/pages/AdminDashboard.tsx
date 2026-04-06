import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ClipboardCheck, History, Loader2, LogOut, Store, Users, ListChecks, UserCircle } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import AdminSupplierVerificationPanel from '../components/admin/AdminSupplierVerificationPanel';
import AdminPastVerificationsPanel from '../components/admin/AdminPastVerificationsPanel';
import { useAuth } from '../contexts/AuthContext';
import { invokeAdminEdgeFunction, type AdminStatsPayload } from '../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../lib/supabase';
import { publicMarketingSiteUrl } from '../lib/adminHost';

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'suppliers' | 'past_verifications'>('overview');
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await invokeAdminEdgeFunction<AdminStatsPayload>({ action: 'stats' });
      setStats(data);
    } catch (e) {
      setStats(null);
      setStatsError(e instanceof Error ? e.message : 'Could not load stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') void loadStats();
  }, [activeTab, loadStats]);

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'suppliers' as const, label: 'Supplier verification', icon: ClipboardCheck },
    { id: 'past_verifications' as const, label: 'Past verifications', icon: History },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center gap-4 py-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 text-sm mt-1">
                Signed in as <span className="font-medium text-gray-800">{user?.email ?? '—'}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={publicMarketingSiteUrl()}
                className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline px-2 py-1.5"
              >
                Public site
              </a>
              <LuxuryButton variant="outline" size="sm" onClick={() => void signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </LuxuryButton>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit max-w-full">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white text-sky-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {statsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{statsError}</div>
            )}

            <div className="flex items-center gap-2">
              <LuxuryButton
                variant="outline"
                size="sm"
                onClick={() => void loadStats()}
                disabled={statsLoading}
                className="inline-flex items-center gap-2"
              >
                {statsLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : null}
                Refresh numbers
              </LuxuryButton>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Suppliers</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {statsLoading ? '…' : stats?.total_suppliers ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Total supplier profiles</p>
                  </div>
                  <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
                    <Store className="w-6 h-6 text-sky-600" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending business review</p>
                    <p className="text-3xl font-bold text-amber-800 mt-1">
                      {statsLoading ? '…' : stats?.pending_business_submissions ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Submitted, awaiting review</p>
                  </div>
                  <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                    <ClipboardCheck className="w-6 h-6 text-amber-700" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending payout review</p>
                    <p className="text-3xl font-bold text-amber-800 mt-1">
                      {statsLoading ? '…' : stats?.pending_payout_submissions ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">IBAN/BIC submitted</p>
                  </div>
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                    <ListChecks className="w-6 h-6 text-emerald-700" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Listings (published)</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {statsLoading ? '…' : stats?.published_listings ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      of {statsLoading ? '…' : stats?.total_listings ?? '—'} total (incl. drafts)
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <BarChart3 className="w-6 h-6 text-violet-600" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Registered customers</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {statsLoading ? '…' : stats?.registered_customers ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Consumer profiles (site sign-ups)</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                    <UserCircle className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Visitors / traffic</p>
                    <p className="text-lg font-semibold text-gray-700 mt-2">Use your host analytics</p>
                    <p className="text-xs text-gray-500 mt-2">
                      e.g. Vercel Analytics or Plausible — not stored in Supabase here.
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-gray-500" />
                  </div>
                </div>
              </LuxuryCard>
            </div>
          </div>
        )}

        {activeTab === 'suppliers' && <AdminSupplierVerificationPanel />}
        {activeTab === 'past_verifications' && <AdminPastVerificationsPanel />}
      </div>
    </div>
  );
}
