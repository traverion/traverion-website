import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ClipboardCheck, History, Loader2, LogOut, Megaphone, Store, Users, ListChecks, UserCircle } from 'lucide-react';
import AdminSupplierVerificationPanel from '../components/admin/AdminSupplierVerificationPanel';
import AdminPastVerificationsPanel from '../components/admin/AdminPastVerificationsPanel';
import AdminSupplierPortalMessagesPanel from '../components/admin/AdminSupplierPortalMessagesPanel';
import NoticeCallout from '../components/NoticeCallout';
import { useAuth } from '../contexts/AuthContext';
import { invokeAdminEdgeFunction, type AdminStatsPayload } from '../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../lib/supabase';
import { publicMarketingSiteUrl } from '../lib/adminHost';

type Metric = {
  label: string;
  value: string;
  hint: string;
  icon: typeof Store;
  accent: string;
  valueClass?: string;
};

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'suppliers' | 'past_verifications' | 'portal_messages'>('overview');
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
    { id: 'portal_messages' as const, label: 'Portal messages', icon: Megaphone },
  ];

  const metrics: Metric[] = [
    {
      label: 'Suppliers',
      value: statsLoading ? '…' : String(stats?.total_suppliers ?? '—'),
      hint: 'Total supplier profiles',
      icon: Store,
      accent: 'bg-finland/10 text-finland',
    },
    {
      label: 'Pending business review',
      value: statsLoading ? '…' : String(stats?.pending_business_submissions ?? '—'),
      hint: 'Submitted, awaiting review',
      icon: ClipboardCheck,
      accent: 'bg-amber-100 text-amber-800',
      valueClass: 'text-amber-900',
    },
    {
      label: 'Pending payout review',
      value: statsLoading ? '…' : String(stats?.pending_payout_submissions ?? '—'),
      hint: 'IBAN/BIC submitted',
      icon: ListChecks,
      accent: 'bg-emerald-100 text-emerald-800',
      valueClass: 'text-amber-900',
    },
    {
      label: 'Listings (published)',
      value: statsLoading ? '…' : String(stats?.published_listings ?? '—'),
      hint: `of ${statsLoading ? '…' : stats?.total_listings ?? '—'} total (incl. drafts)`,
      icon: BarChart3,
      accent: 'bg-finland/10 text-finland',
    },
    {
      label: 'Registered customers',
      value: statsLoading ? '…' : String(stats?.registered_customers ?? '—'),
      hint: 'Consumer profiles (site sign-ups)',
      icon: UserCircle,
      accent: 'bg-finland/10 text-finland',
    },
    {
      label: 'Visitors / traffic',
      value: 'Host analytics',
      hint: 'e.g. Vercel Analytics or Plausible — not stored in Supabase here.',
      icon: Users,
      accent: 'bg-black/[0.05] text-ink-muted',
      valueClass: 'text-base font-semibold text-ink-muted',
    },
  ];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-black/[0.06] bg-paper-raised/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center gap-4 py-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-1">Traverion Admin</p>
              <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-ink">Operations</h1>
              <p className="text-ink-muted text-sm mt-1">
                Signed in as <span className="font-medium text-ink">{user?.email ?? '—'}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={publicMarketingSiteUrl()} className="tv-btn-ghost text-sm">
                Public site
              </a>
              <button type="button" onClick={() => void signOut()} className="tv-btn-secondary text-sm inline-flex items-center gap-2">
                <LogOut className="w-4 h-4" aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div
            className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1 w-fit max-w-full"
            role="tablist"
            aria-label="Admin sections"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`lux-flat flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-paper-raised text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2 shrink-0" aria-hidden />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {statsError ? (
              <NoticeCallout
                title="Could not load overview"
                tone="danger"
                action={
                  <button type="button" onClick={() => void loadStats()} className="tv-btn-secondary text-sm">
                    Retry
                  </button>
                }
              >
                {statsError}
              </NoticeCallout>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadStats()}
                disabled={statsLoading}
                className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {statsLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : null}
                Refresh numbers
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.label}
                    className="rounded-2xl bg-paper-raised p-5 shadow-soft ring-1 ring-black/[0.06]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{m.label}</p>
                        <p
                          className={`mt-1.5 font-display tracking-tight tabular-nums ${
                            m.valueClass ?? 'text-3xl text-ink'
                          }`}
                        >
                          {m.value}
                        </p>
                        <p className="text-xs text-ink-muted mt-2 leading-relaxed">{m.hint}</p>
                      </div>
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${m.accent}`}
                        aria-hidden
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'suppliers' && <AdminSupplierVerificationPanel />}
        {activeTab === 'past_verifications' && <AdminPastVerificationsPanel />}
        {activeTab === 'portal_messages' && <AdminSupplierPortalMessagesPanel />}
      </div>
    </div>
  );
}
