import PriceBreakdown from '../PriceBreakdown';
import { formatMoney } from '../../lib/money';
import { readStayBookingPrice } from '../../lib/stay-price';

/** Shows the price frozen at checkout. Never rebuilds it from the listing's current rates. */
export default function SavedStayPrice({
  snapshot,
  currency,
  amountPaid,
  totalLabel = 'Booked total',
}: {
  snapshot: unknown;
  currency: string | null | undefined;
  amountPaid?: number | null;
  totalLabel?: string;
}) {
  const price = readStayBookingPrice(snapshot);
  if (!price) return null;
  const paid =
    typeof amountPaid === 'number' && Number.isFinite(amountPaid) ? Math.round(amountPaid * 100) / 100 : null;
  const paidDiffers = paid != null && Math.abs(paid - price.total) > 0.009;
  return (
    <div className="mt-2">
      <PriceBreakdown
        currency={currency}
        lines={price.lines}
        total={price.total}
        totalLabel={totalLabel}
        footnote={
          price.requests.length
            ? `Requested, not charged: ${price.requests
                .map((row) => (row.quantity > 1 ? `${row.name} × ${row.quantity}` : row.name))
                .join(', ')}. The host confirms these separately.`
            : null
        }
      />
      {paidDiffers ? (
        <p className="mt-2 text-sm text-ink">
          Amount paid <span className="font-semibold tabular-nums">{formatMoney(paid, currency)}</span>
        </p>
      ) : null}
    </div>
  );
}
