import { useCallback, useEffect, useState } from 'react';
import { Loader2, Percent, RefreshCw, Wallet } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import { formatMoney } from '../../lib/money';
import { COMMERCIAL_PLANS, formatBpsAsPercent, fromMinorUnits } from '../../lib/commercial-money';
import NoticeCallout from '../NoticeCallout';
import EmptyState from '../EmptyState';

type TermsRow = {
  id: string;
  supplier_id: string;
  plan_code: string;
  commission_bps: number;
  payout_cadence: string;
  effective_from: string;
  effective_until: string | null;
  status: string;
  note: string | null;
  created_at?: string;
};

type CommercialGetPayload = {
  current: TermsRow | null;
  history: TermsRow[];
  economicsMinor: { gmv: number; commission: number; supplierEarn: number };
  earningStatusMinor: Record<string, number>;
};

type PayoutPeriodRow = {
  id: string;
  supplier_id: string;
  currency: string;
  cadence: string;
  period_key: string;
  period_start: string;
  period_end: string;
  scheduled_for: string;
  status: string;
  amount_minor: number;
  item_count: number;
  created_at: string;
  paid_at: string | null;
  note: string | null;
};

function majorFromMinor(minor: number, currency: string): string {
  return formatMoney(fromMinorUnits(Number(minor) || 0), currency);
}

export default function AdminCommercialPanel() {
  const [supplierId, setSupplierId] = useState('');
  const [loadedId, setLoadedId] = useState('');
  const [detail, setDetail] = useState<CommercialGetPayload | null>(null);
  const [periods, setPeriods] = useState<PayoutPeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [plan, setPlan] = useState<'standard' | 'fast'>('standard');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const loadPeriods = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setPeriodsLoading(true);
    try {
      const data = await invokeAdminEdgeFunction<{ items: PayoutPeriodRow[] }>({
        action: 'payout_periods_list',
      });
      setPeriods(Array.isArray(data.items) ? data.items : []);
    } catch {
      setPeriods([]);
    } finally {
      setPeriodsLoading(false);
    }
  }, []);

  const loadSupplier = useCallback(async (id: string) => {
    const sid = id.trim();
    if (!sid) {
      setError('Enter a supplier user ID.');
      return;
    }
    setLoading(true);
    setError(null);
    setActionMsg(null);
    try {
      const data = await invokeAdminEdgeFunction<CommercialGetPayload>({
        action: 'commercial_terms_get',
        supplierId: sid,
      });
      setDetail(data);
      setLoadedId(sid);
      if (data.current?.plan_code === 'fast') setPlan('fast');
      else setPlan('standard');
    } catch (e) {
      setDetail(null);
      setLoadedId('');
      setError(e instanceof Error ? e.message : 'Could not load commercial terms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void loadPeriods();
  }, [loadPeriods]);

  const applyTerms = async () => {
    if (!loadedId) {
      setActionMsg('Load a supplier first.');
      return;
    }
    if (confirmText.trim().toUpperCase() !== 'CONFIRM') {
      setActionMsg('Type CONFIRM to apply commercial terms.');
      return;
    }
    setBusy(true);
    setActionMsg(null);
    try {
      const def = COMMERCIAL_PLANS[plan];
      const effectiveIso = effectiveFrom.trim()
        ? new Date(effectiveFrom).toISOString()
        : undefined;
      await invokeAdminEdgeFunction({
        action: 'commercial_terms_set',
        supplierId: loadedId,
        commercialPlanCode: plan,
        commercialCommissionBps: def.commissionBps,
        commercialPayoutCadence: def.payoutCadence,
        commercialEffectiveFrom: effectiveIso,
        commercialNote: note.trim() || undefined,
        commercialConfirm: true,
      });
      setActionMsg(`Applied ${def.label} (${formatBpsAsPercent(def.commissionBps)}).`);
      setConfirmText('');
      setNote('');
      await loadSupplier(loadedId);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not set terms');
    } finally {
      setBusy(false);
    }
  };

  const prepareDue = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      const data = await invokeAdminEdgeFunction<{
        ok?: boolean;
        periods_touched?: number;
        items_included?: number;
      }>({ action: 'prepare_due_payouts' });
      setActionMsg(
        `Prepared payouts: ${data.periods_touched ?? 0} period(s), ${data.items_included ?? 0} earning item(s). No bank transfer.`
      );
      await loadPeriods();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Prepare failed');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (periodId: string) => {
    if (!window.confirm('Mark this READY payout period as paid? This records a payout — it does not send money.')) {
      return;
    }
    setBusy(true);
    setActionMsg(null);
    try {
      await invokeAdminEdgeFunction({
        action: 'mark_payout_period_paid',
        payoutPeriodId: periodId,
        payoutNote: 'Marked paid via admin commercial panel',
      });
      setActionMsg('Payout period marked paid.');
      await loadPeriods();
      if (loadedId) await loadSupplier(loadedId);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not mark paid');
    } finally {
      setBusy(false);
    }
  };

  const econ = detail?.economicsMinor;
  const status = detail?.earningStatusMinor ?? {};

  return (
    <div className="space-y-4">
      <div className="tv-card p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-finland/10 flex items-center justify-center shrink-0">
            <Percent className="w-4 h-4 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg text-ink tracking-tight">Commercial terms & payouts</h2>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              STANDARD 15% monthly · FAST 18% twice-monthly. Changing terms requires CONFIRM and an effective
              date. Preparation creates READY periods only — no bank transfer.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="block min-w-[16rem] flex-1">
            <span className="text-xs font-medium text-ink-muted">Supplier user ID</span>
            <input
              type="text"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="tv-input mt-1 w-full text-sm font-mono"
              placeholder="uuid"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadSupplier(supplierId)}
            disabled={loading || !isSupabaseConfigured()}
            className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Load terms
          </button>
          <button
            type="button"
            onClick={() => void prepareDue()}
            disabled={busy || !isSupabaseConfigured()}
            className="tv-btn-secondary text-sm disabled:opacity-50"
          >
            Prepare due payouts
          </button>
        </div>

        {error ? (
          <div className="mt-4">
            <NoticeCallout title="Could not load" tone="danger">
              {error}
            </NoticeCallout>
          </div>
        ) : null}
        {actionMsg ? (
          <div className="mt-4">
            <NoticeCallout title="Commercial action" tone="success">
              {actionMsg}
            </NoticeCallout>
          </div>
        ) : null}
      </div>

      {detail ? (
        <div className="tv-card p-4 sm:p-5 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Current plan</p>
            {detail.current ? (
              <p className="mt-1 font-display text-xl text-ink tracking-tight">
                {detail.current.plan_code.toUpperCase()} ·{' '}
                {formatBpsAsPercent(detail.current.commission_bps)} ·{' '}
                {detail.current.payout_cadence === 'semimonthly' ? 'Twice-monthly' : 'Monthly'}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">No active terms (legacy until assigned).</p>
            )}
            {detail.current ? (
              <p className="mt-1 text-xs text-ink-muted">
                Effective since {new Date(detail.current.effective_from).toLocaleString()}
                {detail.current.note ? ` · ${detail.current.note}` : ''}
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-black/[0.06] pt-4">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">GMV (remaining)</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(fromMinorUnits(econ?.gmv ?? 0), 'EUR')}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Platform commission</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(fromMinorUnits(econ?.commission ?? 0), 'EUR')}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Supplier earnings</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(fromMinorUnits(econ?.supplierEarn ?? 0), 'EUR')}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Pending</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(fromMinorUnits(status.pending ?? 0), 'EUR')}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Eligible</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(fromMinorUnits(status.eligible ?? 0), 'EUR')}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Paid</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(fromMinorUnits(status.paid ?? 0), 'EUR')}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-ink-faint">
            Economics above sum remaining snapshot minors for this supplier (multi-currency not blended in UI —
            EUR label is display-only when mixed).
          </p>

          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <h3 className="font-display text-base text-ink">Change commercial terms</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Plan</span>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as 'standard' | 'fast')}
                  className="tv-input mt-1 w-full text-sm"
                >
                  <option value="standard">STANDARD — 15% · Monthly (1st)</option>
                  <option value="fast">FAST — 18% · Twice-monthly (1st & 15th)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-muted">Effective from (optional ISO)</span>
                <input
                  type="datetime-local"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="tv-input mt-1 w-full text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-ink-muted">Internal note</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="tv-input mt-1 w-full text-sm"
                  maxLength={2000}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-ink-muted">Type CONFIRM to apply</span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="tv-input mt-1 w-full text-sm"
                  autoComplete="off"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void applyTerms()}
              disabled={busy}
              className="tv-btn-primary text-sm disabled:opacity-50"
            >
              Apply terms (audit recorded)
            </button>
          </div>

          {detail.history.length > 0 ? (
            <div className="border-t border-black/[0.06] pt-4">
              <h3 className="font-display text-base text-ink mb-2">Terms history</h3>
              <ul className="space-y-2 text-sm">
                {detail.history.map((h) => (
                  <li key={h.id} className="text-ink-muted">
                    <span className="font-medium text-ink">{h.plan_code}</span> ·{' '}
                    {formatBpsAsPercent(h.commission_bps)} · {h.payout_cadence} · {h.status}
                    <span className="text-ink-faint">
                      {' '}
                      · from {new Date(h.effective_from).toLocaleDateString()}
                      {h.effective_until
                        ? ` → ${new Date(h.effective_until).toLocaleDateString()}`
                        : ' → open'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="tv-card p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-finland/10 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg text-ink tracking-tight">Payout periods</h2>
            <p className="text-sm text-ink-muted mt-1">READY / PAID preparation ledger. No automatic bank transfer.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadPeriods()}
            disabled={periodsLoading}
            className="tv-btn-ghost text-sm"
          >
            Refresh
          </button>
        </div>

        {!periodsLoading && periods.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payout periods yet"
            body="Run Prepare due payouts on a run day (1st / 15th) after earnings are eligible."
          />
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {periods.map((p) => (
              <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {p.status.toUpperCase()} · {majorFromMinor(p.amount_minor, p.currency)} · {p.item_count}{' '}
                    booking{p.item_count === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-ink-muted font-mono mt-0.5">
                    {p.supplier_id.slice(0, 8)}… · {p.period_key} · {p.cadence} · {p.currency}
                  </p>
                </div>
                {p.status === 'ready' ? (
                  <button
                    type="button"
                    onClick={() => void markPaid(p.id)}
                    disabled={busy}
                    className="tv-btn-secondary text-sm disabled:opacity-50"
                  >
                    Mark paid
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
