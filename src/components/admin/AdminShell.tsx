import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Flag,
  History,
  Loader2,
  LogOut,
  Mail,
  Megaphone,
  Percent,
  RefreshCw,
  ShieldOff,
  Users,
  Wallet,
} from 'lucide-react';
import AdminSupplierVerificationPanel from './AdminSupplierVerificationPanel';
import AdminPastVerificationsPanel from './AdminPastVerificationsPanel';
import AdminSupplierPortalMessagesPanel from './AdminSupplierPortalMessagesPanel';
import AdminBookingsPanel from './AdminBookingsPanel';
import AdminFinancePanel from './AdminFinancePanel';
import AdminCommercialPanel from './AdminCommercialPanel';
import AdminInquiriesPanel from './AdminInquiriesPanel';
import AdminListingsModerationPanel from './AdminListingsModerationPanel';
import AdminContentReportsPanel from './AdminContentReportsPanel';
import NoticeCallout from '../NoticeCallout';
import { useAuth } from '../../contexts/AuthContext';
import { invokeAdminEdgeFunction, type AdminStatsPayload } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import { publicMarketingSiteUrl } from '../../lib/adminHost';
import { appStripeIsTestMode } from '../../lib/money';

export type AdminTab =
  | 'overview'
  | 'bookings'
  | 'finance'
  | 'commercial'
  | 'users'
  | 'suppliers'
  | 'past_verifications'
  | 'listings'
  | 'inquiries'
  | 'reports'
  | 'portal_messages'
  | 'system';

type NavItem = { id: AdminTab; label: string; icon: typeof BarChart3; group: string };

const NAV: NavItem[] = [
  { id: 'overview', label: 'Live overview', icon: BarChart3, group: 'Ops' },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays, group: 'Ops' },
  { id: 'suppliers', label: 'Supplier review', icon: ClipboardCheck, group: 'Ops' },
  { id: 'past_verifications', label: 'Past reviews', icon: History, group: 'Ops' },
  { id: 'finance', label: 'Finance', icon: Wallet, group: 'Money' },
  { id: 'commercial', label: 'Commercial', icon: Percent, group: 'Money' },
  { id: 'users', label: 'Users', icon: Users, group: 'People' },
  { id: 'listings', label: 'Listings', icon: ShieldOff, group: 'People' },
  { id: 'inquiries', label: 'Inquiries', icon: Mail, group: 'People' },
  { id: 'reports', label: 'Reports', icon: Flag, group: 'People' },
  { id: 'portal_messages', label: 'Portal messages', icon: Megaphone, group: 'People' },
  { id: 'system', label: 'System / reset', icon: AlertTriangle, group: 'System' },
];

function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-900'
      : tone === 'danger'
        ? 'text-red-800'
        : tone === 'ok'
          ? 'text-emerald-800'
          : 'text-ink';
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`tv-card p-3.5 text-left w-full ${onClick ? 'hover:ring-1 hover:ring-finland/30 transition' : ''}`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-ink-muted leading-snug">{hint}</p> : null}
    </Wrapper>
  );
}

function LiveOverview({
  onJump,
}: {
  onJump: (tab: AdminTab) => void;
}) {
  const [stats, setStats] = useState<AdminStatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<AdminStatsPayload>({ action: 'stats' });
      setStats(data);
      setUpdatedAt(data.generated_at ?? new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load live stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const n = (v: number | undefined) => (loading && !stats ? '…' : String(v ?? '—'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink tracking-tight">Live operations</h2>
          <p className="text-sm text-ink-muted mt-1">
            Auto-refreshes every 15s from the server. Click a tile to open that section.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
          Refresh now
        </button>
      </div>

      {appStripeIsTestMode() ? (
        <NoticeCallout title="Stripe TEST mode" tone="warn">
          All payment figures and checkout flows are TEST. No live charges.
        </NoticeCallout>
      ) : null}

      {error ? (
        <NoticeCallout title="Live stats unavailable" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      <p className="text-xs text-ink-faint">
        Last update:{' '}
        {updatedAt ? new Date(updatedAt).toLocaleString() : '—'}
        {loading ? ' · refreshing…' : ''}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricCard
          label="Needs business review"
          value={n(stats?.pending_business_submissions)}
          tone={(stats?.pending_business_submissions ?? 0) > 0 ? 'warn' : 'ok'}
          onClick={() => onJump('suppliers')}
        />
        <MetricCard
          label="Needs payout review"
          value={n(stats?.pending_payout_submissions)}
          tone={(stats?.pending_payout_submissions ?? 0) > 0 ? 'warn' : 'ok'}
          onClick={() => onJump('suppliers')}
        />
        <MetricCard
          label="Refund due"
          value={n(stats?.refund_due_bookings)}
          tone={(stats?.refund_due_bookings ?? 0) > 0 ? 'danger' : 'default'}
          hint="Cancelled, still paid — Stripe not refunded yet"
          onClick={() => onJump('bookings')}
        />
        <MetricCard
          label="Open disputes"
          value={n(stats?.open_disputes)}
          tone={(stats?.open_disputes ?? 0) > 0 ? 'danger' : 'default'}
          onClick={() => onJump('commercial')}
        />
        <MetricCard
          label="Financial holds"
          value={n(stats?.active_financial_holds)}
          tone={(stats?.active_financial_holds ?? 0) > 0 ? 'warn' : 'default'}
          onClick={() => onJump('commercial')}
        />
        <MetricCard
          label="READY payouts"
          value={n(stats?.ready_payout_periods)}
          onClick={() => onJump('commercial')}
        />
        <MetricCard
          label="Open reports"
          value={n(stats?.open_content_reports)}
          onClick={() => onJump('reports')}
        />
        <MetricCard
          label="New inquiries"
          value={n(stats?.open_inquiries)}
          onClick={() => onJump('inquiries')}
        />
      </div>

      <h3 className="font-display text-base text-ink pt-2">Marketplace snapshot</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricCard label="Suppliers" value={n(stats?.total_suppliers)} onClick={() => onJump('users')} />
        <MetricCard
          label="Published listings"
          value={n(stats?.published_listings)}
          hint={`of ${n(stats?.total_listings)} total`}
          onClick={() => onJump('listings')}
        />
        <MetricCard
          label="Bookings"
          value={n(stats?.total_bookings)}
          hint={`${n(stats?.paid_bookings)} paid · ${n(stats?.confirmed_bookings)} confirmed`}
          onClick={() => onJump('bookings')}
        />
        <MetricCard
          label="Customers"
          value={n(stats?.registered_customers)}
          hint={stats?.auth_users != null && stats.auth_users >= 0 ? `${stats.auth_users} auth users` : undefined}
          onClick={() => onJump('users')}
        />
      </div>
    </div>
  );
}

function UsersPanel() {
  const [items, setItems] = useState<
    {
      id: string;
      email: string | null;
      created_at: string;
      last_sign_in_at: string | null;
      role: string | null;
      is_admin_keep: boolean;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: typeof items }>({ action: 'users_list' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load users');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink tracking-tight">Auth users</h2>
          <p className="text-sm text-ink-muted mt-1">
            Sole keep account: <span className="font-medium text-ink">info.traverion@gmail.com</span>
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="tv-btn-secondary text-sm" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </button>
      </div>
      {error ? (
        <NoticeCallout title="Could not load users" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      <ul className="tv-card divide-y divide-black/[0.06]">
        {items.map((u) => (
          <li key={u.id} className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <p className="font-medium text-ink">
                {u.email ?? '(no email)'}
                {u.is_admin_keep ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-finland">Admin keep</span>
                ) : null}
              </p>
              <p className="text-xs text-ink-muted font-mono mt-0.5">{u.id}</p>
            </div>
            <div className="text-xs text-ink-muted text-right">
              <p>role: {u.role ?? '—'}</p>
              <p>created {new Date(u.created_at).toLocaleDateString()}</p>
              <p>
                last sign-in{' '}
                {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </li>
        ))}
        {!loading && items.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-muted">No users returned.</li>
        ) : null}
      </ul>
    </div>
  );
}

function SystemResetPanel() {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    if (confirm.trim() !== 'RESET MARKETPLACE') {
      setResult('Type exactly: RESET MARKETPLACE');
      return;
    }
    if (
      !window.confirm(
        'This deletes ALL listings, bookings, suppliers, customers, and auth users except info.traverion@gmail.com. Continue?'
      )
    ) {
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const data = await invokeAdminEdgeFunction<{
        ok?: boolean;
        deletedUsers?: number;
        keptUsers?: number;
        counts?: Record<string, number>;
        errors?: string[];
      }>({
        action: 'marketplace_reset',
        marketplaceResetConfirm: 'RESET MARKETPLACE',
      });
      setResult(
        `Done. Deleted users: ${data.deletedUsers ?? 0}. Kept: ${data.keptUsers ?? 0}. Table deletes: ${JSON.stringify(
          data.counts ?? {}
        )}${data.errors?.length ? ` · Errors: ${data.errors.join(' | ')}` : ''}`
      );
      setConfirm('');
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="font-display text-xl text-ink tracking-tight">System / marketplace reset</h2>
      <NoticeCallout title="Destructive — TEST wipe" tone="danger">
        Removes mock tours/stays, bookings, suppliers, customers, and every auth user except{' '}
        <strong>info.traverion@gmail.com</strong>. Does not change Stripe keys or LIVE mode. Use before
        clean founder testing.
      </NoticeCallout>
      <label className="block">
        <span className="text-xs font-medium text-ink-muted">Type RESET MARKETPLACE to confirm</span>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="tv-input mt-1 w-full text-sm"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="tv-btn-primary text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
        Wipe marketplace (keep admin)
      </button>
      {result ? (
        <NoticeCallout title="Reset result" tone="info">
          <pre className="whitespace-pre-wrap text-xs mt-1">{result}</pre>
        </NoticeCallout>
      ) : null}
    </div>
  );
}

export default function AdminShell() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col lg:flex-row">
      <aside className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-black/[0.06] bg-paper-raised/80">
        <div className="px-4 py-4 lg:py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Traverion</p>
          <h1 className="font-display text-lg tracking-tight text-ink mt-0.5">Admin</h1>
          <p className="text-xs text-ink-muted mt-1 truncate" title={user?.email ?? undefined}>
            {user?.email ?? '—'}
          </p>
        </div>
        <nav className="px-2 pb-4 space-y-3" aria-label="Admin">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2 mb-1 text-[10px] uppercase tracking-[0.14em] text-ink-faint">{group}</p>
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${
                        activeTab === item.id
                          ? 'bg-finland text-white'
                          : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" aria-hidden />
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="px-3 pb-4 flex flex-col gap-1.5">
          <a href={publicMarketingSiteUrl()} className="tv-btn-ghost text-sm justify-start">
            Public site
          </a>
          <button
            type="button"
            onClick={() => void signOut()}
            className="tv-btn-secondary text-sm inline-flex items-center gap-2 justify-start"
          >
            <LogOut className="w-4 h-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
        {activeTab === 'overview' && <LiveOverview onJump={setActiveTab} />}
        {activeTab === 'bookings' && <AdminBookingsPanel />}
        {activeTab === 'finance' && <AdminFinancePanel />}
        {activeTab === 'commercial' && <AdminCommercialPanel />}
        {activeTab === 'users' && <UsersPanel />}
        {activeTab === 'suppliers' && <AdminSupplierVerificationPanel />}
        {activeTab === 'past_verifications' && <AdminPastVerificationsPanel />}
        {activeTab === 'listings' && <AdminListingsModerationPanel />}
        {activeTab === 'inquiries' && <AdminInquiriesPanel />}
        {activeTab === 'reports' && <AdminContentReportsPanel />}
        {activeTab === 'portal_messages' && <AdminSupplierPortalMessagesPanel />}
        {activeTab === 'system' && <SystemResetPanel />}
      </main>
    </div>
  );
}
