import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  Search,
  ShieldOff,
  Store,
  UserCircle,
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
  | 'suppliers_dir'
  | 'customers'
  | 'suppliers'
  | 'past_verifications'
  | 'listings'
  | 'inquiries'
  | 'reports'
  | 'portal_messages'
  | 'system';

type NavItem = { id: AdminTab; label: string; icon: typeof BarChart3; group: string };

const NAV: NavItem[] = [
  { id: 'overview', label: 'Command center', icon: BarChart3, group: 'Ops' },
  { id: 'bookings', label: 'Bookings', icon: CalendarDays, group: 'Ops' },
  { id: 'listings', label: 'Listings', icon: ShieldOff, group: 'Ops' },
  { id: 'suppliers', label: 'Verification queue', icon: ClipboardCheck, group: 'Ops' },
  { id: 'past_verifications', label: 'Past reviews', icon: History, group: 'Ops' },
  { id: 'finance', label: 'Finance', icon: Wallet, group: 'Money' },
  { id: 'commercial', label: 'Commercial & payouts', icon: Percent, group: 'Money' },
  { id: 'suppliers_dir', label: 'All suppliers', icon: Store, group: 'People' },
  { id: 'customers', label: 'All customers', icon: UserCircle, group: 'People' },
  { id: 'users', label: 'Auth users', icon: Users, group: 'People' },
  { id: 'inquiries', label: 'Inquiries', icon: Mail, group: 'People' },
  { id: 'reports', label: 'Content reports', icon: Flag, group: 'People' },
  { id: 'portal_messages', label: 'Portal messages', icon: Megaphone, group: 'People' },
  { id: 'system', label: 'Wipe / system', icon: AlertTriangle, group: 'System' },
];

const TAB_IDS = new Set(NAV.map((n) => n.id));

function tabFromHash(): AdminTab {
  if (typeof window === 'undefined') return 'overview';
  const h = window.location.hash.replace(/^#/, '') as AdminTab;
  return TAB_IDS.has(h) ? h : 'overview';
}

function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
  onClick,
  delayMs = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
  onClick?: () => void;
  delayMs?: number;
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
      style={{ animationDelay: `${delayMs}ms` }}
      className={`tv-card p-3.5 text-left w-full animate-fade-in-up motion-reduce:animate-none ${
        onClick
          ? 'hover:ring-1 hover:ring-finland/35 hover:-translate-y-0.5 transition-all duration-200 ease-lux'
          : ''
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-ink-muted leading-snug">{hint}</p> : null}
    </Wrapper>
  );
}

function PanelFrame({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 animate-lux-page-in motion-reduce:animate-none">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink tracking-tight">{title}</h2>
          {subtitle ? <p className="text-sm text-ink-muted mt-1 max-w-2xl leading-relaxed">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function LiveOverview({ onJump }: { onJump: (tab: AdminTab) => void }) {
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
    <PanelFrame
      title="Command center"
      subtitle="Live marketplace pulse. Tiles jump to the right control surface. Auto-refreshes every 15s."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
          Refresh
        </button>
      }
    >
      {appStripeIsTestMode() ? (
        <NoticeCallout title="Stripe TEST mode" tone="warn">
          Payments and Money are sandbox. No live charges until you explicitly go LIVE.
        </NoticeCallout>
      ) : null}

      {error ? (
        <NoticeCallout title="Live stats unavailable" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      <p className="text-xs text-ink-faint">
        Last update: {updatedAt ? new Date(updatedAt).toLocaleString() : '—'}
        {loading ? ' · refreshing…' : ''}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MetricCard
          label="Business review"
          value={n(stats?.pending_business_submissions)}
          tone={(stats?.pending_business_submissions ?? 0) > 0 ? 'warn' : 'ok'}
          onClick={() => onJump('suppliers')}
          delayMs={0}
        />
        <MetricCard
          label="Payout review"
          value={n(stats?.pending_payout_submissions)}
          tone={(stats?.pending_payout_submissions ?? 0) > 0 ? 'warn' : 'ok'}
          onClick={() => onJump('suppliers')}
          delayMs={40}
        />
        <MetricCard
          label="Refund due"
          value={n(stats?.refund_due_bookings)}
          tone={(stats?.refund_due_bookings ?? 0) > 0 ? 'danger' : 'default'}
          hint="Cancelled + still paid"
          onClick={() => onJump('bookings')}
          delayMs={80}
        />
        <MetricCard
          label="Open disputes"
          value={n(stats?.open_disputes)}
          tone={(stats?.open_disputes ?? 0) > 0 ? 'danger' : 'default'}
          onClick={() => onJump('commercial')}
          delayMs={120}
        />
        <MetricCard
          label="Financial holds"
          value={n(stats?.active_financial_holds)}
          tone={(stats?.active_financial_holds ?? 0) > 0 ? 'warn' : 'default'}
          onClick={() => onJump('commercial')}
          delayMs={160}
        />
        <MetricCard
          label="READY payouts"
          value={n(stats?.ready_payout_periods)}
          onClick={() => onJump('commercial')}
          delayMs={200}
        />
        <MetricCard
          label="Open reports"
          value={n(stats?.open_content_reports)}
          onClick={() => onJump('reports')}
          delayMs={240}
        />
        <MetricCard
          label="New inquiries"
          value={n(stats?.open_inquiries)}
          onClick={() => onJump('inquiries')}
          delayMs={280}
        />
      </div>

      <h3 className="font-display text-base text-ink pt-2">Marketplace</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MetricCard label="Suppliers" value={n(stats?.total_suppliers)} onClick={() => onJump('suppliers_dir')} delayMs={0} />
        <MetricCard
          label="Published listings"
          value={n(stats?.published_listings)}
          hint={`of ${n(stats?.total_listings)} total`}
          onClick={() => onJump('listings')}
          delayMs={40}
        />
        <MetricCard
          label="Bookings"
          value={n(stats?.total_bookings)}
          hint={`${n(stats?.paid_bookings)} paid · ${n(stats?.cancelled_bookings)} cancelled`}
          onClick={() => onJump('bookings')}
          delayMs={80}
        />
        <MetricCard
          label="Customers"
          value={n(stats?.registered_customers)}
          hint={
            stats?.auth_users != null && stats.auth_users >= 0 ? `${stats.auth_users} auth users` : undefined
          }
          onClick={() => onJump('customers')}
          delayMs={120}
        />
      </div>
    </PanelFrame>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-[14rem] flex-1 max-w-md">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="tv-input w-full text-sm pl-9"
      />
    </label>
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
  const [q, setQ] = useState('');
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (u) =>
        (u.email ?? '').toLowerCase().includes(needle) ||
        u.id.toLowerCase().includes(needle) ||
        (u.role ?? '').toLowerCase().includes(needle)
    );
  }, [items, q]);

  return (
    <PanelFrame
      title="Auth users"
      subtitle="Every account in Supabase Auth. Sole keep account for wipe: info.traverion@gmail.com."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={q} onChange={setQ} placeholder="Filter email, id, role…" />
          <button type="button" onClick={() => void load()} className="tv-btn-secondary text-sm" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>
      }
    >
      {error ? (
        <NoticeCallout title="Could not load users" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      <p className="text-xs text-ink-faint">
        {filtered.length} shown · {items.length} total
      </p>
      <ul className="tv-card divide-y divide-black/[0.06] overflow-hidden">
        {filtered.map((u, i) => (
          <li
            key={u.id}
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm animate-fade-in-up motion-reduce:animate-none"
          >
            <div className="min-w-0">
              <p className="font-medium text-ink truncate">
                {u.email ?? '(no email)'}
                {u.is_admin_keep ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-finland">Admin keep</span>
                ) : null}
              </p>
              <p className="text-xs text-ink-muted font-mono mt-0.5 break-all">{u.id}</p>
            </div>
            <div className="text-xs text-ink-muted text-right shrink-0">
              <p>role: {u.role ?? '—'}</p>
              <p>created {new Date(u.created_at).toLocaleDateString()}</p>
              <p>last {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}</p>
            </div>
          </li>
        ))}
        {!loading && filtered.length === 0 ? (
          <li className="px-4 py-8 text-sm text-ink-muted text-center">No users match.</li>
        ) : null}
      </ul>
    </PanelFrame>
  );
}

function SuppliersDirectoryPanel() {
  const [items, setItems] = useState<
    {
      id: string;
      display_name: string | null;
      email: string | null;
      verification_status: string | null;
      payout_verification_status: string | null;
      listings_count: number;
      bookings_count: number;
      created_at: string;
      contact_phone: string | null;
      default_currency: string | null;
    }[]
  >([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: typeof items }>({ action: 'suppliers_directory' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load suppliers');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (s) =>
        (s.display_name ?? '').toLowerCase().includes(needle) ||
        (s.email ?? '').toLowerCase().includes(needle) ||
        s.id.toLowerCase().includes(needle) ||
        (s.verification_status ?? '').toLowerCase().includes(needle)
    );
  }, [items, q]);

  return (
    <PanelFrame
      title="All suppliers"
      subtitle="Full provider directory — identity, verification, listing and booking counts. Use Commercial for commission terms."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={q} onChange={setQ} placeholder="Search suppliers…" />
          <button type="button" onClick={() => void load()} className="tv-btn-secondary text-sm" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>
      }
    >
      {error ? (
        <NoticeCallout title="Could not load suppliers" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      <div className="tv-card overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="text-[11px] uppercase tracking-[0.12em] text-ink-faint border-b border-black/[0.06]">
            <tr>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-3 py-3 font-medium">Business</th>
              <th className="px-3 py-3 font-medium">Payout</th>
              <th className="px-3 py-3 font-medium tabular-nums">Listings</th>
              <th className="px-3 py-3 font-medium tabular-nums">Bookings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-finland/[0.03] transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{s.display_name || '—'}</p>
                  <p className="text-xs text-ink-muted">{s.email || 'no email'}</p>
                  <p className="text-[10px] font-mono text-ink-faint mt-0.5">{s.id.slice(0, 8)}…</p>
                </td>
                <td className="px-3 py-3 text-ink-muted">{s.verification_status ?? '—'}</td>
                <td className="px-3 py-3 text-ink-muted">{s.payout_verification_status ?? '—'}</td>
                <td className="px-3 py-3 tabular-nums">{s.listings_count}</td>
                <td className="px-3 py-3 tabular-nums">{s.bookings_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink-muted text-center">No suppliers yet — clean slate.</p>
        ) : null}
      </div>
    </PanelFrame>
  );
}

function CustomersDirectoryPanel() {
  const [items, setItems] = useState<
    {
      id: string;
      display_name: string | null;
      email: string | null;
      contact_phone: string | null;
      bookings_count: number;
      created_at: string;
    }[]
  >([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: typeof items }>({ action: 'consumers_directory' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load customers');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (c) =>
        (c.display_name ?? '').toLowerCase().includes(needle) ||
        (c.email ?? '').toLowerCase().includes(needle) ||
        (c.contact_phone ?? '').includes(needle) ||
        c.id.toLowerCase().includes(needle)
    );
  }, [items, q]);

  return (
    <PanelFrame
      title="All customers"
      subtitle="Traveler / consumer profiles with booking counts."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={q} onChange={setQ} placeholder="Search customers…" />
          <button type="button" onClick={() => void load()} className="tv-btn-secondary text-sm" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>
      }
    >
      {error ? (
        <NoticeCallout title="Could not load customers" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      <ul className="tv-card divide-y divide-black/[0.06]">
        {filtered.map((c) => (
          <li key={c.id} className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <p className="font-medium text-ink">{c.display_name || c.email || 'Traveler'}</p>
              <p className="text-xs text-ink-muted">{c.email ?? '—'}</p>
              {c.contact_phone ? <p className="text-xs text-ink-faint mt-0.5">{c.contact_phone}</p> : null}
            </div>
            <div className="text-xs text-ink-muted text-right">
              <p className="tabular-nums font-medium text-ink">{c.bookings_count} bookings</p>
              <p>joined {new Date(c.created_at).toLocaleDateString()}</p>
            </div>
          </li>
        ))}
        {!loading && filtered.length === 0 ? (
          <li className="px-4 py-8 text-sm text-ink-muted text-center">No customers yet — clean slate.</li>
        ) : null}
      </ul>
    </PanelFrame>
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
        'Deletes ALL tours, stays, bookings, suppliers, customers, and auth users except info.traverion@gmail.com. Irreversible. Continue?'
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
        wipe?: unknown;
        errors?: string[];
      }>({
        action: 'marketplace_reset',
        marketplaceResetConfirm: 'RESET MARKETPLACE',
      });
      setResult(
        JSON.stringify(
          {
            deletedUsers: data.deletedUsers,
            keptUsers: data.keptUsers,
            wipe: data.wipe,
            errors: data.errors,
          },
          null,
          2
        )
      );
      setConfirm('');
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelFrame
      title="Wipe marketplace"
      subtitle="Clean TEST slate before founder dogfooding. Keeps only info.traverion@gmail.com."
    >
      <NoticeCallout title="Destructive — TEST wipe" tone="danger">
        Removes all listings (tours + stays), bookings, money ledgers, supplier/customer profiles, and every auth
        user except <strong>info.traverion@gmail.com</strong>. Does not change Stripe keys or go LIVE.
      </NoticeCallout>
      <label className="block max-w-xl">
        <span className="text-xs font-medium text-ink-muted">Type RESET MARKETPLACE</span>
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
        disabled={busy || confirm.trim() !== 'RESET MARKETPLACE'}
        className="tv-btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <AlertTriangle className="w-4 h-4" aria-hidden />}
        Wipe tours, stays & users
      </button>
      {result ? (
        <NoticeCallout title="Reset result" tone="info">
          <pre className="whitespace-pre-wrap text-xs mt-1 font-mono max-h-80 overflow-auto">{result}</pre>
        </NoticeCallout>
      ) : null}
    </PanelFrame>
  );
}

export default function AdminShell() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => tabFromHash());
  const [navOpen, setNavOpen] = useState(false);

  const setTab = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    setNavOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `#${tab}`);
    }
  }, []);

  useEffect(() => {
    const onHash = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const groups = [...new Set(NAV.map((n) => n.group))];
  const activeLabel = NAV.find((n) => n.id === activeTab)?.label ?? 'Admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-paper via-[#f3f0ea] to-[#e8eef6] text-ink flex flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-black/[0.06] bg-paper-raised/90 backdrop-blur-md sticky top-0 z-20">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-finland">Traverion Admin</p>
          <p className="font-display text-base tracking-tight">{activeLabel}</p>
        </div>
        <button type="button" className="tv-btn-secondary text-sm" onClick={() => setNavOpen((v) => !v)}>
          {navOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      <aside
        className={`${
          navOpen ? 'flex' : 'hidden'
        } lg:flex lg:w-64 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-black/[0.06] bg-paper-raised/85 backdrop-blur-md lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto animate-fade-in motion-reduce:animate-none`}
      >
        <div className="px-4 py-5 hidden lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-finland">Traverion</p>
          <h1 className="font-display text-xl tracking-tight text-ink mt-0.5">Control</h1>
          <p className="text-xs text-ink-muted mt-1.5 truncate" title={user?.email ?? undefined}>
            {user?.email ?? '—'}
          </p>
          {appStripeIsTestMode() ? (
            <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-900">
              Stripe TEST
            </span>
          ) : null}
        </div>
        <nav className="px-2 pb-4 space-y-4 flex-1" aria-label="Admin">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2.5 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint">{group}</p>
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-all duration-200 ease-lux ${
                          active
                            ? 'bg-finland text-white shadow-sm scale-[1.01]'
                            : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="px-3 pb-5 flex flex-col gap-1.5 border-t border-black/[0.06] pt-3">
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

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 lg:py-7" key={activeTab}>
        {activeTab === 'overview' && <LiveOverview onJump={setTab} />}
        {activeTab === 'bookings' && (
          <PanelFrame title="Bookings" subtitle="Every reservation — refunds, disputes, investigation.">
            <AdminBookingsPanel />
          </PanelFrame>
        )}
        {activeTab === 'finance' && (
          <PanelFrame title="Finance" subtitle="Platform totals and manual payout recording.">
            <AdminFinancePanel />
          </PanelFrame>
        )}
        {activeTab === 'commercial' && (
          <PanelFrame title="Commercial & payouts" subtitle="Commission terms, periods, holds, refund instructions.">
            <AdminCommercialPanel />
          </PanelFrame>
        )}
        {activeTab === 'users' && <UsersPanel />}
        {activeTab === 'suppliers_dir' && <SuppliersDirectoryPanel />}
        {activeTab === 'customers' && <CustomersDirectoryPanel />}
        {activeTab === 'suppliers' && (
          <PanelFrame title="Verification queue" subtitle="Approve or reject business and payout submissions.">
            <AdminSupplierVerificationPanel />
          </PanelFrame>
        )}
        {activeTab === 'past_verifications' && (
          <PanelFrame title="Past reviews" subtitle="Historical verification decisions.">
            <AdminPastVerificationsPanel />
          </PanelFrame>
        )}
        {activeTab === 'listings' && (
          <PanelFrame title="Listings" subtitle="Moderate tours and stays — force unpublish when needed.">
            <AdminListingsModerationPanel />
          </PanelFrame>
        )}
        {activeTab === 'inquiries' && (
          <PanelFrame title="Inquiries" subtitle="Contact form inbox.">
            <AdminInquiriesPanel />
          </PanelFrame>
        )}
        {activeTab === 'reports' && (
          <PanelFrame title="Content reports" subtitle="Review reports and hide abusive reviews.">
            <AdminContentReportsPanel />
          </PanelFrame>
        )}
        {activeTab === 'portal_messages' && (
          <PanelFrame title="Portal messages" subtitle="Broadcast notices into the partner app.">
            <AdminSupplierPortalMessagesPanel />
          </PanelFrame>
        )}
        {activeTab === 'system' && <SystemResetPanel />}
      </main>
    </div>
  );
}
