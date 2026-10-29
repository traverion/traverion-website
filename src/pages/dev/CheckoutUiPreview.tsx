/**
 * DEV-only visual harness for Review & Payment + Booking Confirmed chrome.
 * Open /checkout-ui-preview?mode=… in DEV.
 */
import type { ReactNode } from 'react';
import { CheckCircle, Lock, MapPin, Package } from 'lucide-react';
import CheckoutPageShell, { CHECKOUT_TWO_COL } from '../../components/checkout/CheckoutPageShell';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';

type Mode = 'review-tour' | 'review-stay' | 'review-rental' | 'confirm-tour' | 'confirm-stay' | 'confirm-rental';

const MODES: Mode[] = [
  'review-tour',
  'review-stay',
  'review-rental',
  'confirm-tour',
  'confirm-stay',
  'confirm-rental',
];

function modeFromSearch(): Mode {
  const raw = new URLSearchParams(window.location.search).get('mode')?.trim() as Mode | undefined;
  return raw && MODES.includes(raw) ? raw : 'review-rental';
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium leading-snug text-ink break-words">{value}</dd>
    </div>
  );
}

function ReviewLayout({
  title,
  detailsTitle,
  details,
  summaryRows,
  total,
}: {
  title: string;
  detailsTitle: string;
  details: ReactNode;
  summaryRows: { label: string; value: string }[];
  total: string;
}) {
  return (
    <CheckoutPageShell onBrandClick={() => undefined} srBackLabel="Back">
      <div className={CHECKOUT_TWO_COL}>
        <div className="min-w-0 space-y-3">
          <div className="tv-checkout-panel p-3.5 sm:p-4">
            <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">Review & payment</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">Confirm details, then continue to secure payment.</p>

            <section className="mt-3 border-t border-black/[0.06] pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-ink">{detailsTitle}</h3>
                <button type="button" className="text-[13px] font-semibold text-finland">
                  Edit
                </button>
              </div>
              <p className="text-sm font-semibold leading-snug text-ink">{title}</p>
              {details}
            </section>

            <section className="mt-3 border-t border-black/[0.06] pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-ink">Contact</h3>
                <button type="button" className="text-[13px] font-semibold text-finland">
                  Edit
                </button>
              </div>
              <p className="text-sm font-medium text-ink">Alex Traveler</p>
              <p className="text-[13px] text-ink-muted">alex@example.com</p>
              <p className="text-[13px] text-ink-muted">+358 40 123 4567</p>
            </section>

            <section className="mt-3 border-t border-black/[0.06] pt-3">
              <h3 className="text-[13px] font-semibold text-ink">Payment</h3>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Total payable
              </p>
              <p className="mt-1 font-sans text-[1.65rem] font-semibold leading-none tabular-nums text-ink">
                {total}
              </p>
              <p className="mt-2.5 text-[13px] font-medium leading-snug text-ink">
                Free cancellation until 24 hours before.
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-[13px] font-semibold text-finland">
                  Full cancellation & deposit terms
                </summary>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                  Cancel for a full refund up to 24 hours before the start time.
                </p>
              </details>
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
                Secure payment
              </p>
              <button type="button" className="tv-btn-primary mt-3 w-full">
                Continue to secure payment
              </button>
            </section>
          </div>
        </div>

        <aside className="mt-4 hidden lg:sticky lg:top-4 lg:mt-0 lg:block lg:self-start">
          <div className="tv-checkout-panel p-3.5 sm:p-4">
            <p className="tv-eyebrow mb-2.5">Booking summary</p>
            <div className="flex gap-2.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-black/[0.04]">
                <Package className="h-5 w-5 text-ink-faint" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="font-sans text-[15px] font-semibold leading-snug text-ink line-clamp-2">{title}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/[0.06] pt-3">
              {summaryRows.map((row) => (
                <Fact key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
            <p className="mt-3 border-t border-black/[0.06] pt-3 font-sans text-xl font-semibold tabular-nums text-ink">
              {total}
            </p>
          </div>
        </aside>
      </div>
    </CheckoutPageShell>
  );
}

function ConfirmLayout({
  title,
  option,
  summaryLine,
  qtyLine,
  facts,
  total,
}: {
  title: string;
  option?: string;
  summaryLine: string;
  qtyLine: string;
  facts: { label: string; value: string }[];
  total: string;
}) {
  return (
    <CheckoutPageShell
      onBrandClick={() => undefined}
      srBackLabel="Back to Traverion"
      secureLabel="Secure booking"
    >
      <div className="tv-confirm-shell tv-checkout-panel tv-confirm-hero tv-confirm-hero--good mb-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
            <CheckCircle className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-sans text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Booking confirmed!
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-muted">Your adventure is booked.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Paid · Confirmed
              </span>
              <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                TEST
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-ink">TV-PREVIEW01</p>
              <button type="button" className="tv-btn-ghost text-sm">
                Copy
              </button>
              <button type="button" className="tv-btn-ghost text-sm">
                Print
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={CHECKOUT_TWO_COL}>
        <div className="tv-checkout-panel min-w-0 space-y-0 p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] pb-3.5 sm:flex-row sm:items-center">
            <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-lg bg-black/[0.04] sm:h-24 sm:w-36">
              <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain opacity-40" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-sans text-[15px] font-bold leading-snug tracking-tight text-ink sm:text-base">
                {title}
              </h2>
              {option ? <p className="mt-0.5 text-[13px] text-ink-muted">{option}</p> : null}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                <span className="font-medium text-ink">{summaryLine}</span>
                <span>{qtyLine}</span>
              </div>
            </div>
          </div>
          {facts.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-black/[0.08] py-3.5">
              {facts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
            </dl>
          ) : null}
          <div className="border-b border-black/[0.08] py-3.5">
            <div className="tv-confirm-fact !p-0">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Location & directions
                </p>
                <p className="mt-0.5 text-[13px] font-semibold leading-snug text-ink">
                  Rovaniemi city center pickup zone
                </p>
                <button type="button" className="mt-1.5 text-[13px] font-semibold text-finland">
                  Open directions
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="mt-4 min-w-0 space-y-3 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
          <div className="tv-checkout-panel p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Amount paid</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-ink">{total}</p>
            <p className="mt-2 text-[13px] font-medium leading-snug text-ink">
              Free cancellation until 24 hours before.
            </p>
            <details className="mt-2 border-b border-black/[0.08] pb-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink">Cancellation terms</summary>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                Cancel for a full refund up to 24 hours before the start time.
              </p>
            </details>
            <p className="py-3 text-[13px] text-ink-muted">
              Your booking details and updates are available in Trips.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button type="button" className="tv-btn-primary w-full">
                View booking in Trips
              </button>
              <button type="button" className="px-1 py-2 text-center text-sm font-semibold text-finland">
                Explore more experiences
              </button>
            </div>
          </div>
        </aside>
      </div>
    </CheckoutPageShell>
  );
}

export default function CheckoutUiPreview() {
  const mode = modeFromSearch();

  if (mode === 'review-tour') {
    return (
      <ReviewLayout
        title="Northern Lights Guarantee"
        detailsTitle="Booking details"
        total="€189"
        summaryRows={[
          { label: 'Date', value: 'Fri 12 Dec' },
          { label: 'Departure', value: '20:00' },
          { label: 'Participants', value: '2 adults' },
        ]}
        details={
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
            <Fact label="Date" value="Fri 12 Dec" />
            <Fact label="Departure" value="20:00" />
            <Fact label="Participants" value="2 adults" />
            <Fact label="Pickup" value="Hotel Santa Claus" />
          </dl>
        }
      />
    );
  }

  if (mode === 'review-stay') {
    return (
      <ReviewLayout
        title="Arctic Aurora Apartment"
        detailsTitle="Booking details"
        total="€420"
        summaryRows={[
          { label: 'Check-in', value: 'Fri 12 Dec' },
          { label: 'Checkout', value: 'Sun 14 Dec' },
          { label: 'Guests', value: '2 adults · 2 nights' },
        ]}
        details={
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
            <Fact label="Check-in" value="Fri 12 Dec" />
            <Fact label="Checkout" value="Sun 14 Dec" />
            <Fact label="Guests" value="2 adults" />
            <Fact label="Nights" value="2 nights" />
          </dl>
        }
      />
    );
  }

  if (mode === 'review-rental') {
    return (
      <ReviewLayout
        title="Sony A7 IV"
        detailsTitle="Rental details"
        total="€89"
        summaryRows={[
          { label: 'Pickup', value: 'Fri 12 Dec · 10:00' },
          { label: 'Return', value: 'Sat 13 Dec · 18:00' },
          { label: 'Duration', value: '1 day' },
          { label: 'Quantity', value: '1 camera' },
        ]}
        details={
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
            <Fact label="Pickup" value="Fri 12 Dec · 10:00" />
            <Fact label="Return" value="Sat 13 Dec · 18:00" />
            <Fact label="Pickup place" value="Rovaniemi studio" />
            <Fact label="Return place" value="Same as pickup" />
          </dl>
        }
      />
    );
  }

  if (mode === 'confirm-stay') {
    return (
      <ConfirmLayout
        title="Arctic Aurora Apartment"
        summaryLine="Fri 12 Dec → Sun 14 Dec"
        qtyLine="2 guests · 2 nights"
        total="€420"
        facts={[]}
      />
    );
  }

  if (mode === 'confirm-tour') {
    return (
      <ConfirmLayout
        title="Northern Lights Guarantee"
        option="Small group"
        summaryLine="Fri 12 Dec"
        qtyLine="2 participants"
        total="€189"
        facts={[{ label: 'Pickup time', value: '19:30' }]}
      />
    );
  }

  return (
    <ConfirmLayout
      title="Sony A7 IV"
      option="Body only"
      summaryLine="Fri 12 Dec 10:00 → Sat 13 Dec 18:00"
      qtyLine="1 camera · 1 day"
      total="€89"
      facts={[
        { label: 'Pickup place', value: 'Rovaniemi studio' },
        { label: 'Return place', value: 'Same as pickup' },
        { label: 'Pickup handover', value: 'In person' },
      ]}
    />
  );
}
