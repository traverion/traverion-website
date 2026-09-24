import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wallet, Banknote } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import { formatMoney, appStripeIsTestMode, SUPPORTED_CURRENCIES } from '../../lib/money';
import { REFUND_DUE_MANUAL_COPY } from '../../lib/payment-states';
import NoticeCallout from '../NoticeCallout';
import EmptyState from '../EmptyState';

type CurrencyBucket = {
  collected: number;
  collectedCount: number;
  refundDue: number;
  refundDueCount: number;
  ledgerAdjustments: number;
  paidOut: number;
  pendingPayout: number;
  availableBalance: number;
};

type FinanceSummaryPayload = {
  byCurrency: Record<string, CurrencyBucket>;
  truncated: boolean;
};

type RecordPayoutPayload = { ok: true; id: string };

const emptyPayoutForm = {
  supplierId: '',
  amount: '',
  currency: 'EUR',
  periodStart: '',
  periodEnd: '',
  status: 'paid' as 'paid' | 'pending',
  note: '',
};

/**
 * Phase 587/588: this form is the only place in the app that can ever move
 * "Paid out to suppliers" / "Pending payout" below (or above) zero — see
 * migration 094_admin_record_supplier_payout.sql. Payouts stay manual by
 * design (Traverion does not compute or send them); this only records that
 * one already happened or was initiated outside the system, matching the
 * "Payouts are manual, so this page never invents a transfer" copy above.
 */
function RecordPayoutForm({ onRecorded }: { onRecorded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPayoutForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setFormError(null);
    setSuccess(null);

    const supplierId = form.supplierId.trim();
    const amount = Number(form.amount);
    if (!supplierId) {
      setFormError('Supplier user ID is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount must be a positive number.');
      return;
    }
    if (!form.periodStart || !form.periodEnd) {
      setFormError('Period start and end are required.');
      return;
    }
    if (form.periodEnd < form.periodStart) {
      setFormError('Period end cannot be before period start.');
      return;
    }

    setSubmitting(true);
    try {
      await invokeAdminEdgeFunction<RecordPayoutPayload>({
        action: 'record_supplier_payout',
        payoutSupplierId: supplierId,
        payoutAmount: amount,
        payoutCurrency: form.currency,
        payoutPeriodStart: form.periodStart,
        payoutPeriodEnd: form.periodEnd,
        payoutStatus: form.status,
        payoutNote: form.note.trim() || null,
      });
      setSuccess(
        `Recorded: ${formatMoney(amount, form.currency)} (${form.status}) for supplier ${supplierId.slice(0, 8)}…`
      );
      setForm(emptyPayoutForm);
      onRecorded();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not record payout');
    } finally {
      setSubmitting(false);
    }
  }, [form, onRecorded]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tv-btn-secondary text-sm inline-flex items-center gap-2"
      >
        <Banknote className="w-4 h-4" aria-hidden />
        Record a payout
      </button>
    );
  }

  return (
    <div className="tv-card p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-finland/10 flex items-center justify-center shrink-0">
          <Banknote className="w-4 h-4 text-finland" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base text-ink tracking-tight">Record a payout</h3>
          <p className="text-sm text-ink-muted mt-1 leading-relaxed">
            Use this after you actually send a supplier money outside Traverion (bank transfer, etc.). This does not
            move any money itself — it only records that a real payout happened (or was initiated), so "Paid out to
            suppliers" and a supplier's own Money page reflect it. There is no undo yet; double-check before
            submitting.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Supplier user ID</span>
          <input
            type="text"
            value={form.supplierId}
            onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
            placeholder="uuid from the supplier's detail page"
            className="tv-input mt-1 w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Status</span>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'paid' | 'pending' }))}
            className="tv-input mt-1 w-full text-sm"
          >
            <option value="paid">Paid — the transfer already landed</option>
            <option value="pending">Pending — initiated, not yet confirmed</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="tv-input mt-1 w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Currency</span>
          <select
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            className="tv-input mt-1 w-full text-sm"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Period start</span>
          <input
            type="date"
            value={form.periodStart}
            onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
            className="tv-input mt-1 w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-muted">Period end</span>
          <input
            type="date"
            value={form.periodEnd}
            onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
            className="tv-input mt-1 w-full text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-ink-muted">Note (optional — e.g. a bank transfer reference)</span>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="tv-input mt-1 w-full text-sm"
          />
        </label>
      </div>

      {formError ? (
        <div className="mt-3">
          <NoticeCallout title="Could not record payout" tone="danger">
            {formError}
          </NoticeCallout>
        </div>
      ) : null}
      {success ? (
        <div className="mt-3">
          <NoticeCallout title="Payout recorded" tone="success">
            {success}
          </NoticeCallout>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="tv-btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          Record payout
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setForm(emptyPayoutForm);
            setFormError(null);
          }}
          disabled={submitting}
          className="tv-btn-secondary text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function AdminFinancePanel() {
  const [data, setData] = useState<FinanceSummaryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await invokeAdminEdgeFunction<FinanceSummaryPayload>({ action: 'finance_summary' });
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load finance summary');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  const currencies = data ? Object.keys(data.byCurrency).sort((a, b) => (a === 'EUR' ? -1 : a.localeCompare(b))) : [];

  return (
    <div className="space-y-4">
      <div className="tv-card p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-finland/10 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg text-ink tracking-tight">Finance</h2>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              Platform-wide traveler payments, ledger adjustments, and supplier payouts — the same figures and
              formulas partners see on their own Money page, totalled across every supplier. Grouped by currency;
              amounts are never converted or blended across currencies. Payouts are manual, so this page never
              invents a transfer.
            </p>
          </div>
        </div>

        {appStripeIsTestMode() ? (
          <div className="mb-4">
            <NoticeCallout title="Stripe TEST mode" tone="warn">
              Every figure below reflects Traverion's Stripe TEST environment. No real money has moved, and this
              will keep saying TEST until Stripe is switched to live.
            </NoticeCallout>
          </div>
        ) : null}

        {!isSupabaseConfigured() ? (
          <NoticeCallout title="Supabase not configured" tone="warn">
            Finance needs the live app configuration.
          </NoticeCallout>
        ) : null}

        {data?.truncated ? (
          <div className="mb-4">
            <NoticeCallout title="Totals may be incomplete" tone="warn">
              This summary is capped at the most recent 5,000 rows per table. Once the platform has more history than
              that, these totals will undercount — treat them as a lower bound until pagination is added here.
            </NoticeCallout>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !isSupabaseConfigured()}
            className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Refresh
          </button>
          {isSupabaseConfigured() ? <RecordPayoutForm onRecorded={() => void load()} /> : null}
        </div>
      </div>

      {error ? (
        <NoticeCallout title="Could not load finance summary" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {!loading && !error && currencies.length === 0 ? (
        <div className="tv-card px-4 py-2">
          <EmptyState
            icon={Wallet}
            title="No money movement yet"
            body="No traveler payment, ledger entry, or payout exists yet. This page never fills itself with sample figures."
          />
        </div>
      ) : null}

      {currencies.map((code) => {
        const b = data!.byCurrency[code];
        return (
          <section
            key={code}
            className="tv-card p-4 sm:p-5"
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-2">
              {currencies.length > 1 ? `${code} · ` : ''}
              {b.availableBalance < 0 ? 'Negative balance' : 'Net platform balance'}
            </p>
            <p
              className={`font-display text-4xl sm:text-5xl tabular-nums tracking-tight ${
                b.availableBalance < 0 ? 'text-red-800' : 'text-ink'
              }`}
            >
              {formatMoney(b.availableBalance, code)}
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              Collected + ledger adjustments − paid out to suppliers. Same formula as a partner's Money page.
            </p>

            <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-black/[0.06] pt-5">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Collected</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{formatMoney(b.collected, code)}</dd>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {b.collectedCount} paid booking{b.collectedCount === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Ledger adjustments</dt>
                <dd
                  className={`mt-1 text-lg font-semibold tabular-nums ${
                    b.ledgerAdjustments < 0 ? 'text-red-800' : 'text-ink'
                  }`}
                >
                  {formatMoney(b.ledgerAdjustments, code)}
                </dd>
                <p className="mt-0.5 text-xs text-ink-faint">Fees, offsets — ledger only</p>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Paid out to suppliers</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{formatMoney(b.paidOut, code)}</dd>
                <p className="mt-0.5 text-xs text-ink-faint">Recorded payout periods, status Paid</p>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Pending payout</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-amber-900">
                  {formatMoney(b.pendingPayout, code)}
                </dd>
                <p className="mt-0.5 text-xs text-ink-faint">Payout periods not yet marked Paid</p>
              </div>
            </dl>

            {b.refundDueCount > 0 ? (
              <div className="mt-6">
                <NoticeCallout title="Refund due" tone="warn">
                  {b.refundDueCount} cancelled booking{b.refundDueCount === 1 ? '' : 's'} still show Refund due (
                  <span className="tabular-nums font-semibold">{formatMoney(b.refundDue, code)}</span>). That money
                  is not in Collected above. {REFUND_DUE_MANUAL_COPY}
                </NoticeCallout>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
