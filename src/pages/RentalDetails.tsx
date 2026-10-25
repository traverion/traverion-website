/**
 * Traveler rental listing surface.
 * Checkout remains disabled until release approval (mig 282 + RENTAL_CHECKOUT_ENABLED).
 */
import { useEffect, useMemo, useState } from 'react';
import { MapPin, Package, FileText, BadgeInfo } from 'lucide-react';
import { fetchListingById } from '../data/supabase-listings';
import type { TourPackage } from '../types/tour';
import { inventoryFamilyFromListing } from '../lib/inventory';
import { normalizeRentalDetails, formatMinorAsEuro } from '../lib/rental-details';
import { rentalCategoryConfig } from '../lib/rental-categories';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import RentalBookingWidget from '../components/rental/RentalBookingWidget';

type Props = {
  listingId: string;
  onNavigate: (page: string) => void;
};

export default function RentalDetails({ listingId, onNavigate }: Props) {
  const [listing, setListing] = useState<TourPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] tv-page" aria-busy="true" aria-label="Loading rental">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="h-56 animate-pulse rounded-2xl bg-black/[0.05]" />
          <div className="mt-6 h-8 w-64 max-w-full animate-pulse rounded bg-black/[0.06]" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded bg-black/[0.04]" />
        </div>
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
  const requirements = Object.entries(rental.requirements ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.trim()
  );

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-ink">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,22rem)] lg:items-start lg:py-10">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0]">
            {photos[0] ? (
              <div className="grid gap-1 sm:grid-cols-2">
                <img
                  src={photos[0]}
                  alt=""
                  className="aspect-[16/11] h-full w-full object-cover sm:col-span-2 sm:aspect-[21/9]"
                />
                {photos.slice(1, 3).map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="hidden aspect-[16/10] w-full object-cover sm:block"
                  />
                ))}
              </div>
            ) : (
              <div className="flex aspect-[21/9] items-center justify-center bg-[#EEF1F5] text-sm text-ink-muted">
                Photos coming soon
              </div>
            )}
            <div className="space-y-2.5 p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">
                {[cfg?.title, rental.itemType].filter(Boolean).join(' · ') || 'Rental'}
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.35rem] sm:leading-tight">
                {listing.title}
              </h1>
              {place ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {place}
                </p>
              ) : null}
              {listing.subtitle || rental.shortIntro ? (
                <p className="text-base leading-relaxed text-ink-muted">
                  {rental.shortIntro || listing.subtitle}
                </p>
              ) : null}
            </div>
          </section>

          {listing.description ? (
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">About this rental</h2>
              <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {listing.description}
              </p>
            </section>
          ) : null}

          {(listing.highlights?.length ?? 0) > 0 || (rental.highlights?.length ?? 0) > 0 ? (
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Highlights</h2>
              <ul className="mt-2.5 space-y-2">
                {(rental.highlights?.length ? rental.highlights : listing.highlights)!.map((h) => (
                  <li key={h} className="flex gap-2 text-sm text-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#073b83]" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Pickup & return</h2>
            <dl className="mt-2.5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-ink">Pickup</dt>
                <dd className="mt-0.5 text-ink-muted">
                  {rental.pickupAddress || 'Shared after booking opens'}
                </dd>
                {rental.pickupInstructions ? (
                  <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{rental.pickupInstructions}</dd>
                ) : null}
              </div>
              <div>
                <dt className="font-semibold text-ink">Return</dt>
                <dd className="mt-0.5 text-ink-muted">
                  {rental.returnSameAsPickup !== false
                    ? 'Same as pickup'
                    : rental.returnAddress || 'Shared after booking opens'}
                </dd>
                {rental.returnInstructions ? (
                  <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{rental.returnInstructions}</dd>
                ) : null}
              </div>
            </dl>
          </section>

          {(rental.inclusions?.length ?? 0) > 0 ? (
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Included</h2>
              <ul className="mt-2.5 flex flex-wrap gap-2">
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

          {requirements.length > 0 || rental.idRequired || rental.rentalRules ? (
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Requirements & rules</h2>
              <ul className="mt-2.5 space-y-2 text-sm text-ink">
                {rental.idRequired ? (
                  <li className="flex gap-2">
                    <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
                    Valid ID required at pickup
                  </li>
                ) : null}
                {requirements.map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
                    <span>
                      <span className="font-medium">{k}:</span> {v}
                    </span>
                  </li>
                ))}
              </ul>
              {rental.rentalRules ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                  {rental.rentalRules}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <FileText className="h-5 w-5 text-[#073b83]" aria-hidden />
              Cancellation & deposit
            </h2>
            <dl className="mt-2.5 space-y-2 text-sm">
              <div>
                <dt className="font-medium text-ink">Cancellation</dt>
                <dd className="text-ink-muted">
                  {rental.cancellationPreset
                    ? rental.cancellationPreset.replace(/_/g, ' ')
                    : 'Supplier policy applies — shown at booking confirmation'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Security deposit</dt>
                <dd className="text-ink-muted">
                  {rental.depositDisclosure?.trim() ||
                    (rental.depositRequired
                      ? rental.depositAmountMinor
                        ? `${formatMinorAsEuro(rental.depositAmountMinor)} at pickup (not charged online)`
                        : 'Collected at pickup — not charged online'
                      : 'No online deposit. Any deposit is handled at pickup if required.')}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="lg:sticky lg:top-[calc(4.75rem+env(safe-area-inset-top,0px))] lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgb(15_23_42/0.06)] ring-1 ring-[#E6EAF0] sm:p-5">
            <RentalBookingWidget listingId={listingId} rental={rental} checkoutEnabled={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}
