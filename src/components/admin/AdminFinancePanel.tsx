import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import { formatMoney, appStripeIsTestMode } from '../../lib/money';
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
    <div className="space-y-6">
      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl text-ink tracking-tight">Finance</h2>
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

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !isSupabaseConfigured()}
          className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
          Refresh
        </button>
      </div>

      {error ? (
        <NoticeCallout title="Could not load finance summary" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {!loading && !error && currencies.length === 0 ? (
        <div className="rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06]">
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
            className="rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]"
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
