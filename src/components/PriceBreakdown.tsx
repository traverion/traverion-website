import { formatMoney } from '../lib/money';

export type PriceLine = {
  label: string;
  amount: number;
  muted?: boolean;
};

type Props = {
  currency: string | null | undefined;
  lines: PriceLine[];
  total: number;
  totalLabel?: string;
  originalTotal?: number | null;
  discountLabel?: string | null;
  footnote?: string | null;
  holdNote?: string | null;
};

export function PriceHero({
  amount,
  currency,
  basis,
  originalAmount,
  discountLabel,
}: {
  amount: number;
  currency: string | null | undefined;
  basis: string;
  originalAmount?: number | null;
  discountLabel?: string | null;
}) {
  const showStrike = typeof originalAmount === 'number' && originalAmount > amount;
  return (
    <div>
      <p className="text-2xl font-bold text-ink tabular-nums">
        {formatMoney(amount, currency)}
        {showStrike ? (
          <span className="ml-2 text-base font-normal text-ink-faint line-through">
            {formatMoney(originalAmount, currency)}
          </span>
        ) : null}
      </p>
      <p className="text-sm text-ink-muted">{basis}</p>
      {showStrike && discountLabel ? <p className="mt-1 text-sm text-finland">{discountLabel}</p> : null}
    </div>
  );
}

/** Authoritative quote lines only — callers pass server/quote totals, never a guessed UI total. */
export default function PriceBreakdown({
  currency,
  lines,
  total,
  totalLabel = 'Total',
  originalTotal,
  discountLabel,
  footnote,
  holdNote,
}: Props) {
  const showStrike = typeof originalTotal === 'number' && originalTotal > total;
  return (
    <div className="text-sm">
      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li key={line.label} className={`flex justify-between gap-4 ${line.muted ? 'text-ink-faint' : 'text-ink-muted'}`}>
            <span>{line.label}</span>
            <span className="tabular-nums shrink-0">{formatMoney(line.amount, currency)}</span>
          </li>
        ))}
      </ul>
      {showStrike ? (
        <p className="mt-2 text-xs text-finland">
          {discountLabel?.trim() || 'Discount applied'} · was {formatMoney(originalTotal, currency)}
        </p>
      ) : null}
      <div className="mt-3 flex justify-between gap-4 border-t border-black/[0.08] pt-2 font-semibold text-ink">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatMoney(total, currency)}</span>
      </div>
      {holdNote ? <p className="mt-2 text-xs text-ink-muted">{holdNote}</p> : null}
      {footnote ? <p className="mt-1 text-xs text-ink-faint">{footnote}</p> : null}
    </div>
  );
}
