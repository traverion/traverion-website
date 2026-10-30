/**
 * Partner Home Sales KPI — customer sales (gross) before Traverion commission.
 * Uses remaining_gross when commercial snapshots exist so refunds are reflected.
 */

import { isCollectedBooking } from './payment-states';
import { formatMoney, normalizeCurrency } from './money';

export type PartnerHomeSalesBooking = {
  id: string;
  created_at?: string | null;
  currency?: string | null;
  amount_paid?: number | null;
  status?: string | null;
  payment_status?: string | null;
  refund_choice?: string | null;
};

export type PartnerHomeSalesResult = {
  bookings: number;
  /** Major units by currency code */
  currencies: Array<[string, { revenue: number; count: number }]>;
  primary: [string, { revenue: number; count: number }] | null;
  label: string;
  subtitle: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Past 30 days customer sales from successfully paid bookings.
 * Excludes unpaid/failed; uses remaining gross (refund-aware) when provided.
 */
export function computePartnerHomeSales30d(params: {
  bookings: PartnerHomeSalesBooking[];
  /** Major currency units keyed by booking id (from remaining_gross_minor). */
  remainingGrossByBookingId?: Record<string, number>;
  nowMs?: number;
}): PartnerHomeSalesResult {
  const nowMs = params.nowMs ?? Date.now();
  const cutoff = nowMs - 30 * DAY_MS;
  const grossMap = params.remainingGrossByBookingId ?? {};
  const collected = params.bookings.filter((b) => {
    if (!isCollectedBooking(b)) return false;
    const createdAt = b.created_at ? new Date(b.created_at).getTime() : NaN;
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });

  const byCurrency = new Map<string, { revenue: number; count: number }>();
  for (const b of collected) {
    const code = normalizeCurrency(b.currency);
    const cur = byCurrency.get(code) ?? { revenue: 0, count: 0 };
    const fromSnap = Object.prototype.hasOwnProperty.call(grossMap, b.id)
      ? Number(grossMap[b.id])
      : NaN;
    const legacy = Number(b.amount_paid ?? 0);
    const amount = Number.isFinite(fromSnap) ? fromSnap : Number.isFinite(legacy) ? legacy : 0;
    cur.revenue += amount;
    cur.count += 1;
    byCurrency.set(code, cur);
  }

  const currencies = [...byCurrency.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const primary = currencies[0] ?? null;
  const label = primary ? formatMoney(primary[1].revenue, primary[0]) : '—';
  const subtitle =
    collected.length > 0
      ? `Past 30 days · ${collected.length} paid booking${collected.length === 1 ? '' : 's'}`
      : 'Past 30 days · No paid bookings';

  return {
    bookings: collected.length,
    currencies,
    primary,
    label,
    subtitle,
  };
}
