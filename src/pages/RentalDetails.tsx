/**
 * Traveler rental listing surface.
 * Checkout remains disabled until release approval (mig 282 + RENTAL_CHECKOUT_ENABLED).
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Shield, Package } from 'lucide-react';
import { fetchListingById } from '../data/supabase-listings';
import type { TourPackage } from '../types/tour';
import { inventoryFamilyFromListing } from '../lib/inventory';
import { normalizeRentalDetails, formatMinorAsEuro, effectiveVariantPricing } from '../lib/rental-details';
import { quoteRentalLine } from '../lib/rental-quote';
import { COMMERCIAL_PLANS } from '../lib/commercial-money';
import { rentalCategoryConfig } from '../lib/rental-categories';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';

type Props = {
  listingId: string;
  onNavigate: (page: string) => void;
};

export default function RentalDetails({ listingId, onNavigate }: Props) {
  const [listing, setListing] = useState<TourPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [days, setDays] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const row = await fetchListingById(listingId);
        if (cancelled) return;
        if (!row || inventoryFamilyFromListing(row) !== 'rental') {
          setError('This rental listing is not available.');
          setListing(null);
          return;
        }
        setListing(row);
        const rental = normalizeRentalDetails(row.listingExtras?.rental);
        const first = rental?.variants?.[0]?.id ?? '';
        setVariantId(first);
      } catch (e) {
        if (!cancelled) setError(userFacingError(e, USER_ERROR.tour));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const rental = useMemo(
    () => (listing ? normalizeRentalDetails(listing.listingExtras?.rental) : undefined),
    [listing]
  );
  const cfg = rentalCategoryConfig(rental?.category);
  const photos = useMemo(() => {
    if (!listing) return [] as string[];
    const slots = (listing.listingExtras as { photoSlots?: string[] } | undefined)?.photoSlots ?? [];
    const fromSlots = slots.filter((u) => typeof u === 'string' && u.startsWith('http'));
    if (fromSlots.length) return fromSlots;
    return listing.image ? [listing.image] : [];
  }, [listing]);

  const quote = useMemo(() => {
    if (!rental || !variantId) return null;
    return quoteRentalLine({
      rental,
      variantId,
      quantity,
      durationCount: days,
      unit: rental.durationMode === 'hourly' ? 'hour' : 'day',
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
  }, [rental, variantId, quantity, days]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] tv-page">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-muted">Loading rental…</div>
      </div>
    );
  }

  if (error || !listing || !rental) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] tv-page px-4 py-10">
        <ErrorState
          title="Rental unavailable"
          body={error ?? 'We could not load this rental.'}
          retry={{ label: 'Browse tours', onClick: () => onNavigate('packages') }}
        />
      </div>
    );
  }

  const place = [listing.city, listing.country].filter(Boolean).join(', ');
  const variants = rental.variants ?? [];
  const selected = variants.find((v) => v.id === variantId) ?? variants[0];
  const pricing = selected ? effectiveVariantPricing(rental, selected) : null;

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-ink">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,22rem)] lg:py-10">
        <div className="min-w-0 space-y-8">
          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]">
            {photos[0] ? (
              <div className="grid gap-1 sm:grid-cols-2">
                <img src={photos[0]} alt="" className="aspect-[16/11] h-full w-full object-cover sm:col-span-2 sm:aspect-[21/9]" />
                {photos.slice(1, 3).map((url) => (
                  <img key={url} src={url} alt="" className="hidden aspect-[16/10] w-full object-cover sm:block" />
                ))}
              </div>
            ) : (
              <div className="flex aspect-[21/9] items-center justify-center bg-[#EEF1F5] text-sm text-ink-muted">
                Photos coming soon
              </div>
            )}
            <div className="space-y-3 p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">
                {[cfg?.title, rental.itemType].filter(Boolean).join(' · ') || 'Rental'}
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {listing.title}
              </h1>
              {place ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {place}
                </p>
              ) : null}
              {listing.subtitle ? <p className="text-base text-ink-muted">{listing.subtitle}</p> : null}
            </div>
          </section>

          {listing.description ? (
            <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">About this rental</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{listing.description}</p>
            </section>
          ) : null}

          {(listing.highlights?.length ?? 0) > 0 ? (
            <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Highlights</h2>
              <ul className="mt-3 space-y-2">
                {listing.highlights!.map((h) => (
                  <li key={h} className="flex gap-2 text-sm text-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#073b83]" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E6EAF0] sm:p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Pickup & return</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-ink">Pickup</dt>
                <dd className="text-ink-muted">{rental.pickupAddress || 'Shared after booking opens'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Return</dt>
                <dd className="text-ink-muted">
                  {rental.returnSameAsPickup !== false
                    ? 'Same as pickup'
                    : rental.returnAddress || 'Shared after booking opens'}
                </dd>
              </div>
            </dl>
          </section>

          {(rental.inclusions?.length ?? 0) > 0 ? (
            <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Included</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {rental.inclusions!.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F6F8] px-3 py-1.5 text-xs font-medium text-ink"
                  >
                    <Package className="h-3.5 w-3.5 text-[#073b83]" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgb(15_23_42/0.06)] ring-1 ring-[#E6EAF0]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">From</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">
                {formatMinorAsEuro(
                  rental.durationMode === 'hourly'
                    ? pricing?.pricePerHourMinor
                    : pricing?.pricePerDayMinor
                )}
                <span className="ml-1 text-sm font-medium text-ink-muted">
                  / {rental.durationMode === 'hourly' ? 'hour' : 'day'} · per unit
                </span>
              </p>
            </div>

            {variants.length > 0 ? (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">Option</span>
                <select
                  className="tv-input w-full"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.quantity} unit{v.quantity === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">Units</span>
                <input
                  type="number"
                  min={1}
                  max={selected?.quantity ?? 1}
                  className="tv-input w-full"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink">
                  {rental.durationMode === 'hourly' ? 'Hours' : 'Days'}
                </span>
                <input
                  type="number"
                  min={1}
                  className="tv-input w-full"
                  value={days}
                  onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            </div>

            {quote?.ok ? (
              <p className="text-sm text-ink">
                Example total{' '}
                <span className="font-semibold">{formatMinorAsEuro(quote.customerTotalMinor)}</span>
                <span className="text-ink-muted"> (illustrative — not a checkout quote)</span>
              </p>
            ) : quote && !quote.ok ? (
              <p className="text-sm text-[#9f1239]">{quote.error}</p>
            ) : null}

            <div className="rounded-xl bg-[#F4F6F8] px-3.5 py-3 text-sm text-ink-muted" role="note">
              <p className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
                Online rental booking is not open yet. Inventory holds and payments stay disabled until Traverion
                certifies the full checkout path.
              </p>
            </div>

            <button type="button" className="tv-btn-primary min-h-12 w-full font-semibold opacity-60" disabled>
              Booking unavailable
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Availability engine is live for suppliers — traveler checkout comes next.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
