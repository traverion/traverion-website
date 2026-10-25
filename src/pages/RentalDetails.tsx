/**
 * Traveler rental listing. Drafts render only for the supplier or a team member.
 * Checkout stays behind the server capability probe.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BadgeInfo, Clock, FileText, MapPin, Package } from 'lucide-react';
import RentalBookingWidget from '../components/rental/RentalBookingWidget';
import RentalCollectionMap from '../components/supplier/listing-creation/RentalCollectionMap';
import RentalPhotoGallery from '../components/rental/RentalPhotoGallery';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../contexts/AuthContext';
import { fetchListingById } from '../data/supabase-listings';
import { inventoryFamilyFromListing } from '../lib/inventory';
import { rentalCancellationCustomerText } from '../lib/rental-cancellation';
import { formatMinorAsEuro, effectiveVariantPricing, normalizeRentalDetails, rentalCustomerSkillSuitability } from '../lib/rental-details';
import {
  rentalCategoryTitle,
  rentalDepositCustomerText,
  rentalDurationCustomerText,
  rentalHoursLines,
  rentalItemLabel,
  rentalRequirementLabel,
  rentalSpecLabel,
  rentalReturnPoint,
} from '../lib/rental-presentation';
import { supabase } from '../lib/supabase';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import type { TourPackage } from '../types/tour';
import type { RentalDetails as RentalModel } from '../types/rental';

type Props = {
  listingId: string;
  onNavigate: (page: string) => void;
};

async function viewerMayPreviewDraft(supplierId: string | undefined, userId: string | undefined): Promise<boolean> {
  if (!supplierId || !userId) return false;
  if (supplierId === userId) return true;
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('supplier_team_members')
    .select('user_id')
    .eq('supplier_id', supplierId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.user_id);
}

function photoList(listing: TourPackage): string[] {
  const slots = (listing.listingExtras as { photoSlots?: string[] } | undefined)?.photoSlots ?? [];
  const fromSlots = slots.filter((url) => typeof url === 'string' && url.startsWith('http'));
  if (fromSlots.length) return fromSlots;
  return listing.image ? [listing.image] : [];
}

export default function RentalDetails({ listingId, onNavigate }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [listing, setListing] = useState<TourPackage | null>(null);
  const [draftPreview, setDraftPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setDraftPreview(false);
      try {
        const row = await fetchListingById(listingId);
        if (cancelled) return;
        if (!row || inventoryFamilyFromListing(row) !== 'rental') {
          setListing(null);
          setError('This rental is not available.');
          return;
        }
        const published = row.status === 'published';
        if (!published) {
          const allowed = await viewerMayPreviewDraft(row.supplierId, user?.id);
          if (cancelled) return;
          if (!allowed) {
            setListing(null);
            setError('This rental is not available.');
            return;
          }
          setDraftPreview(true);
        }
        setListing(row);
      } catch (e) {
        if (!cancelled) {
          setListing(null);
          setError(userFacingError(e, USER_ERROR.tour));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, authLoading, user?.id]);

  const rental = useMemo(
    () => (listing ? normalizeRentalDetails(listing.listingExtras?.rental) : undefined),
    [listing]
  );

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA]" aria-busy="true" aria-label="Loading rental">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="h-72 animate-pulse rounded-2xl bg-black/[0.05]" />
          <div className="mt-6 h-8 w-72 max-w-full animate-pulse rounded bg-black/[0.06]" />
        </div>
      </div>
    );
  }

  if (error || !listing || !rental) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] px-4 py-10">
        <ErrorState
          title="Rental unavailable"
          body={error ?? 'We could not load this rental.'}
          retry={{ label: 'Browse rentals', onClick: () => onNavigate('rentals') }}
        />
      </div>
    );
  }

  return (
    <RentalBody
      listing={listing}
      rental={rental}
      draftPreview={draftPreview}
      onNavigate={onNavigate}
    />
  );
}

function RentalBody({
  listing,
  rental,
  draftPreview,
  onNavigate,
}: {
  listing: TourPackage;
  rental: RentalModel;
  draftPreview: boolean;
  onNavigate: (page: string) => void;
}) {
  const photos = photoList(listing);
  const place = [listing.city, listing.country].filter(Boolean).join(', ');
  const item = rentalItemLabel(rental);
  const specs = Object.entries(rental.specifications ?? {}).filter(([key, value]) => key !== 'skillLevel' && value.trim());
  const requirements = Object.entries(rental.requirements ?? {}).filter(([, value]) => value.trim());
  const hours = rentalHoursLines(rental.operatingDays);
  const returnPoint = rentalReturnPoint(rental);
  const variants = rental.variants ?? [];
  const highlights = (rental.highlights?.length ? rental.highlights : listing.highlights) ?? [];

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-ink">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <button type="button" className="text-sm font-semibold text-[#073b83]" onClick={() => onNavigate('rentals')}>
          All rentals
        </button>
        {draftPreview ? (
          <p className="mt-4 rounded-xl bg-[#F4F6F8] px-3.5 py-2.5 text-sm text-ink" role="note">
            Draft preview. Travelers cannot see this listing, and it cannot be booked until Traverion publishes rentals.
          </p>
        ) : null}

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,22rem)] lg:items-start">
          <div className="min-w-0 space-y-5">
            <RentalPhotoGallery photos={photos} title={listing.title} />

            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">
                {[rentalCategoryTitle(rental), item].filter(Boolean).join(' · ')}
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.35rem] sm:leading-tight">
                {listing.title}
              </h1>
              {place ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {place}
                </p>
              ) : null}
              {rental.shortIntro || listing.subtitle ? (
                <p className="mt-3 text-base leading-relaxed text-ink-muted">{rental.shortIntro || listing.subtitle}</p>
              ) : null}
            </section>

            {listing.description ? (
              <Section title="About this rental">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{listing.description}</p>
              </Section>
            ) : null}

            {highlights.length > 0 ? (
              <Section title="Highlights">
                <ul className="space-y-2">
                  {highlights.map((line) => (
                    <li key={line} className="flex gap-2 text-sm text-ink">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#073b83]" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {variants.length > 0 ? (
              <Section title="Options">
                <ul className="space-y-2">
                  {variants.map((variant) => {
                    const day = effectiveVariantPricing(rental, variant).pricePerDayMinor;
                    return (
                    <li key={variant.id} className="rounded-xl bg-[#F7F8FA] px-3.5 py-3">
                      <p className="text-sm font-semibold text-ink">{variant.name}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {variant.quantity} available
                        {day != null && day > 0 ? ` · ${formatMinorAsEuro(day)} / day` : ''}
                      </p>
                    </li>
                    );
                  })}
                </ul>
              </Section>
            ) : null}

            {specs.length > 0 ? (
              <Section title="Specifications">
                <dl className="grid gap-3 sm:grid-cols-2">
                  {specs.map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-sm font-semibold text-ink">{rentalSpecLabel(rental, key)}</dt>
                      <dd className="mt-0.5 text-sm text-ink-muted">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            ) : null}

            {(rental.inclusions?.length ?? 0) > 0 ? (
              <Section title="Included">
                <ul className="flex flex-wrap gap-2">
                  {rental.inclusions!.map((itemName) => (
                    <li
                      key={itemName}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F6F8] px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      <Package className="h-3.5 w-3.5 text-[#073b83]" aria-hidden />
                      {itemName}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {rental.insuranceExclusions?.trim() ? (
              <Section title="Not included">
                <p className="text-sm leading-relaxed text-ink">{rental.insuranceExclusions.trim()}</p>
              </Section>
            ) : null}

            {requirements.length > 0 || rental.idRequired ? (
              <Section title="Requirements">
                <ul className="space-y-2 text-sm text-ink">
                  {rental.idRequired ? (
                    <li className="flex gap-2">
                      <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
                      Valid ID required at pickup
                    </li>
                  ) : null}
                  {requirements.map(([key, value]) => (
                    <li key={key} className="flex gap-2">
                      <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
                      <span>
                        <span className="font-medium">{rentalRequirementLabel(rental, key)}:</span> {value}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {rental.rentalRules?.trim() ? (
              <Section title="Rental rules">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{rental.rentalRules.trim()}</p>
              </Section>
            ) : null}

            {rental.accessibilityStatus === 'details_provided' ? (
              <Section title="Accessibility">
                <ul className="space-y-1 text-sm text-ink">
                  {(rental.accessibilityFeatures ?? []).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {rental.accessibilityNotes?.trim() ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{rental.accessibilityNotes.trim()}</p>
                ) : null}
              </Section>
            ) : null}

            {(rental.difficulty && rental.difficulty !== 'not_applicable') ||
            rental.suitableFor?.trim() ||
            rental.notSuitableFor?.trim() ||
            rentalCustomerSkillSuitability(rental) ? (
              <Section title="Suitability">
                {rental.difficulty === 'easy' ? <p className="text-sm text-ink">Easy</p> : null}
                {rental.difficulty === 'moderate' ? <p className="text-sm text-ink">Moderate</p> : null}
                {rental.difficulty === 'challenging' ? <p className="text-sm text-ink">Challenging</p> : null}
                {rentalCustomerSkillSuitability(rental) ? (
                  <p className="mt-2 text-sm text-ink">Skill suitability: {rentalCustomerSkillSuitability(rental)}</p>
                ) : null}
                {rental.suitableFor?.trim() ? (
                  <p className="mt-2 text-sm text-ink">Suitable for: {rental.suitableFor.trim()}</p>
                ) : null}
                {rental.notSuitableFor?.trim() ? (
                  <p className="mt-2 text-sm text-ink-muted">Not suitable for: {rental.notSuitableFor.trim()}</p>
                ) : null}
              </Section>
            ) : null}

            {(rental.restrictions ?? []).length > 0 ? (
              <Section title="Restrictions">
                <ul className="space-y-1 text-sm text-ink">
                  {(rental.restrictions ?? []).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Pickup and return">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-ink">Pickup</dt>
                  <dd className="mt-0.5 text-ink-muted">{rental.pickupAddress || 'The operator shares the pickup place after booking.'}</dd>
                  {rental.pickupInstructions ? <dd className="mt-1 text-ink-muted">{rental.pickupInstructions}</dd> : null}
                </div>
                <div>
                  <dt className="font-semibold text-ink">Return</dt>
                  <dd className="mt-0.5 text-ink-muted">
                    {returnPoint.sameAsPickup
                      ? returnPoint.address
                        ? `Same place as pickup · ${returnPoint.address}`
                        : 'Same place as pickup'
                      : returnPoint.address || 'The operator shares the return place after booking.'}
                  </dd>
                  {!returnPoint.sameAsPickup && rental.returnInstructions ? (
                    <dd className="mt-1 text-ink-muted">{rental.returnInstructions}</dd>
                  ) : null}
                </div>
              </dl>
              {typeof rental.pickupLat === 'number' && typeof rental.pickupLng === 'number' ? (
                <div className="mt-4">
                  <RentalCollectionMap
                    lat={rental.pickupLat}
                    lng={rental.pickupLng}
                    label={returnPoint.sameAsPickup ? 'Pickup and return map' : 'Pickup location map'}
                  />
                </div>
              ) : null}
              {!returnPoint.sameAsPickup && returnPoint.lat != null && returnPoint.lng != null ? (
                <div className="mt-4">
                  <RentalCollectionMap lat={returnPoint.lat} lng={returnPoint.lng} label="Return location map" />
                </div>
              ) : null}
              {hours.length > 0 ? (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Clock className="h-4 w-4 text-[#073b83]" aria-hidden />
                    Hours
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                    {hours.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>

            <Section title="Rental length">
              <p className="text-sm leading-relaxed text-ink">{rentalDurationCustomerText(rental)}</p>
            </Section>

            <Section title="Cancellation and deposit">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-ink">
                    <FileText className="h-4 w-4 text-[#073b83]" aria-hidden />
                    Cancellation
                  </dt>
                  <dd className="mt-1 text-ink-muted">{rentalCancellationCustomerText(rental.cancellationPreset)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Security deposit</dt>
                  <dd className="mt-1 text-ink-muted">{rentalDepositCustomerText(rental)}</dd>
                </div>
              </dl>
            </Section>
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgb(15_23_42/0.06)] ring-1 ring-[#E6EAF0]">
              <RentalBookingWidget listingId={listing.id} listingTitle={listing.title} rental={rental} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:p-6">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
