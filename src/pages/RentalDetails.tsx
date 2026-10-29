/**
 * Traveler rental listing. Drafts render only for the supplier or a team member.
 * Composition matches Tour PDP chrome; rental booking rules stay rental-specific.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeInfo,
  Calendar,
  CalendarCheck,
  Check,
  Clock,
  KeyRound,
  MapPin,
  Package,
  Share2,
  Star,
  X,
} from 'lucide-react';
import RentalBookingWidget from '../components/rental/RentalBookingWidget';
import RentalCollectionMap from '../components/supplier/listing-creation/RentalCollectionMap';
import ListingPdpPhotoGallery from '../components/ListingPdpPhotoGallery';
import ListingPdpQuickFacts from '../components/ListingPdpQuickFacts';
import ListingPdpCheckList from '../components/ListingPdpCheckList';
import ListingPdpPolicyBlock from '../components/ListingPdpPolicyBlock';
import ErrorState from '../components/ErrorState';
import PublicReviewCard from '../components/PublicReviewCard';
import ListingPdpReviewMeta from '../components/ListingPdpReviewMeta';
import { ListingReviewsModal } from '../components/ListingReviewsModal';
import { TourOperatorBlock } from '../components/tour-detail/TourListingSections';
import RentalBookingConfirm from './RentalBookingConfirm';
import { LISTING_REVIEWS_EMPTY_COPY } from '../lib/booking-confirmation-copy';
import { publicReviewLabel } from '../lib/listingTruth';
import { useAuth } from '../contexts/AuthContext';
import { fetchListingById } from '../data/supabase-listings';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import {
  fetchReviewsByListingId,
  getReviewAggregateForListing,
  getReviewRepliesByReviewIds,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../data/supabase-reviews';
import { isRentalDevPreviewId, loadRentalDevPreviews } from '../lib/rental-dev-preview';
import { inventoryFamilyFromListing } from '../lib/inventory';
import { rentalCancellationCustomerText } from '../lib/rental-cancellation';
import {
  effectiveVariantDurationMode,
  effectiveVariantPricing,
  normalizeRentalDetails,
  rentalCustomerSkillSuitability,
  rentalListingOffersUnit,
} from '../lib/rental-details';
import {
  rentalCategoryTitle,
  rentalDepositCustomerText,
  rentalDurationLengthRows,
  rentalFromPrice,
  rentalHoursLines,
  rentalItemLabel,
  rentalOptionRateLabel,
  rentalPickupHandoverLabel,
  rentalQuantityUnits,
  rentalRequirementLabel,
  rentalReturnHandoverLabel,
  rentalReturnPoint,
  rentalSpecLabel,
} from '../lib/rental-presentation';
import {
  buildRentalCheckoutHref,
  buildRentalListingHref,
  parseRentalCheckoutSearch,
  type RentalCheckoutState,
} from '../lib/rentalCheckoutUrl';
import { scrubListingBookingSelectionFromLocation } from '../lib/listing-booking-fresh';
import { trackListingTraffic } from '../lib/listing-traffic';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { isSupabaseListingId } from '../lib/discount-display';
import { orderedPhotoUrls, photoSlotsFromTourPackage } from '../lib/listingPhotoGrid';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { TourPackage } from '../types/tour';
import type { RentalDetails as RentalModel } from '../types/rental';

type Props = {
  listingId: string;
  onNavigate: (page: string) => void;
};

const sectionClass = 'tv-pdp-section mt-7 border-t border-[#E8EBF0] pt-7';
const headingClass = 'tv-section-heading mb-3.5';

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

/** Same cover + gallery resolution as Tours/Stays (image + galleryImageUrls). */
function photoList(listing: TourPackage): string[] {
  return orderedPhotoUrls(photoSlotsFromTourPackage(listing));
}

function rentalDurationFact(rental: RentalModel): string {
  const hour = rentalListingOffersUnit(rental, 'hour');
  const day = rentalListingOffersUnit(rental, 'day');
  if (hour && day) return 'Hourly or daily';
  if (hour) return 'Hourly';
  return 'Daily';
}

export default function RentalDetails({ listingId, onNavigate }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [listing, setListing] = useState<TourPackage | null>(null);
  const [draftPreview, setDraftPreview] = useState(false);
  const [devPreview, setDevPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setDraftPreview(false);
      setDevPreview(false);
      try {
        if (isRentalDevPreviewId(listingId)) {
          const previews = await loadRentalDevPreviews();
          const preview = previews.find((row) => row.id === listingId) ?? null;
          if (cancelled) return;
          if (!preview) {
            setListing(null);
            setError('This rental is not available.');
            return;
          }
          setDevPreview(true);
          setListing(preview);
          document.title = `${preview.title} · Rentals · Traverion`;
          return;
        }
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
        document.title = `${row.title} · Rentals · Traverion`;
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
      <div className="min-h-screen bg-paper" aria-busy="true" aria-label="Loading rental">
        <div className="tv-shell mx-auto px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-8 w-48 max-w-full animate-pulse rounded bg-black/[0.06]" />
          <div className="mt-4 h-10 w-96 max-w-full animate-pulse rounded bg-black/[0.06]" />
          <div className="mt-6 h-72 animate-pulse rounded-xl bg-black/[0.05]" />
        </div>
      </div>
    );
  }

  if (error || !listing || !rental) {
    return (
      <div className="min-h-screen bg-paper px-4 py-10">
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
      devPreview={devPreview}
      onNavigate={onNavigate}
    />
  );
}

function RentalBody({
  listing,
  rental,
  draftPreview,
  devPreview,
  onNavigate,
}: {
  listing: TourPackage;
  rental: RentalModel;
  draftPreview: boolean;
  devPreview: boolean;
  onNavigate: (page: string) => void;
}) {
  const { user, requestAuth } = useAuth();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const photos = photoList(listing);
  const place = [listing.city, listing.country].filter(Boolean).join(', ') || listing.destination?.trim() || '';
  const item = rentalItemLabel(rental);
  const specs = Object.entries(rental.specifications ?? {}).filter(([key, value]) => key !== 'skillLevel' && value.trim());
  const requirements = Object.entries(rental.requirements ?? {}).filter(([, value]) => value.trim());
  const hours = rentalHoursLines(rental.operatingDays);
  const returnPoint = rentalReturnPoint(rental);
  const variants = rental.variants ?? [];
  const [locationSearch, setLocationSearch] = useState(
    () => (typeof window !== 'undefined' ? window.location.search : '')
  );
  const checkoutFromUrl = useMemo(() => parseRentalCheckoutSearch(locationSearch), [locationSearch]);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  /** Only set when returning from booking review Edit/Back — never from URL/refresh. */
  const [widgetInitial, setWidgetInitial] = useState<Partial<RentalCheckoutState>>({});
  const selectedVariant = variants.find((item) => item.id === variantId) ?? variants[0] ?? null;
  const durationRows = rentalDurationLengthRows(rental, selectedVariant);
  const highlights = (rental.highlights?.length ? rental.highlights : listing.highlights) ?? [];
  const fromPrice = rentalFromPrice(rental);
  const units = rentalQuantityUnits(rental);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const onPop = () => setLocationSearch(window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const rentalListingHydratedRef = useRef<string | null>(null);
  const defaultVariantId = variants[0]?.id ?? '';
  useEffect(() => {
    if (checkoutFromUrl) return;
    if (scrubListingBookingSelectionFromLocation()) {
      setLocationSearch(window.location.search);
    }
    if (rentalListingHydratedRef.current === listing.id) return;
    rentalListingHydratedRef.current = listing.id;
    setVariantId(defaultVariantId);
    setWidgetInitial({});
  }, [checkoutFromUrl, listing.id, defaultVariantId]);

  useEffect(() => {
    if (listing.id && !draftPreview && !devPreview) trackListingTraffic(listing.id, 'view');
  }, [listing.id, draftPreview, devPreview]);

  const pushRentalBookingConfirm = useCallback(
    (state: RentalCheckoutState) => {
      trackListingTraffic(listing.id, 'book_start');
      const href = buildRentalCheckoutHref(listing.id, state);
      window.history.pushState({}, '', href);
      setLocationSearch(window.location.search);
    },
    [listing.id]
  );

  const openRentalBookingConfirm = useCallback(
    (state: RentalCheckoutState) => {
      if (draftPreview || devPreview) return;
      // Shared AuthModal — same Tour/Stay Continue gate. Keep selection; resume into review.
      if (isSupabaseConfigured() && !userRef.current) {
        requestAuth({
          intent: 'checkout',
          onSuccess: () => {
            void (async () => {
              if (supabase) {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData.session?.user) userRef.current = sessionData.session.user;
              }
              if (userRef.current) pushRentalBookingConfirm(state);
            })();
          },
        });
        return;
      }
      pushRentalBookingConfirm(state);
    },
    [draftPreview, devPreview, requestAuth, pushRentalBookingConfirm]
  );

  const closeRentalBookingConfirm = useCallback(
    (state: RentalCheckoutState) => {
      // Clean listing URL; restore selection only in React for this Edit/Back session.
      const href = buildRentalListingHref(listing.id);
      window.history.pushState({}, '', href);
      setLocationSearch(window.location.search);
      setVariantId(state.variantId);
      setWidgetInitial({
        variantId: state.variantId,
        quantity: state.quantity,
        durationUnit: state.durationUnit,
        startDate: state.startDate,
        endDate: state.endDate,
        pickupHm: state.pickupHm,
        returnHm: state.returnHm,
      });
    },
    [listing.id]
  );

  const [supplierLegal, setSupplierLegal] = useState<{
    operatorName: string;
    business_logo_url: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
    public_description?: string | null;
  } | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const legalSheetRef = useRef<HTMLDivElement>(null);
  const closeLegalModal = useCallback(() => setLegalModal(null), []);
  useDialogFocus(legalModal !== null, legalSheetRef, closeLegalModal);

  const [reviews, setReviews] = useState<ReviewDisplay[]>([]);
  const [reviewReplies, setReviewReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [reviewAggregate, setReviewAggregate] = useState<{ rating: number; count: number } | null>(null);
  const [reviewsLoadError, setReviewsLoadError] = useState<string | null>(null);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);

  const canLoadReviews = isSupabaseConfigured() && isSupabaseListingId(listing.id) && !devPreview;

  useEffect(() => {
    if (!listing.supplierId || !isSupabaseConfigured()) {
      setSupplierLegal(null);
      return;
    }
    let cancelled = false;
    void fetchSupplierPublicLegal(listing.supplierId).then((row) => {
      if (cancelled || !row) {
        if (!cancelled) setSupplierLegal(null);
        return;
      }
      setSupplierLegal({
        operatorName: (row.display_name || row.company_legal_name || 'Operator').trim() || 'Operator',
        business_logo_url: row.business_logo_url,
        privacy_policy_text: row.privacy_policy_text,
        terms_conditions_text: row.terms_conditions_text,
        public_description: row.public_description,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [listing.supplierId]);

  useEffect(() => {
    if (!canLoadReviews) {
      setReviews([]);
      setReviewAggregate(null);
      setReviewsLoadError(null);
      return;
    }
    let cancelled = false;
    setReviewsLoadError(null);
    void fetchReviewsByListingId(listing.id)
      .then(async (rows) => {
        if (cancelled) return;
        setReviews(rows);
        const replies = await getReviewRepliesByReviewIds(rows.map((r) => r.id));
        if (!cancelled) setReviewReplies(replies);
      })
      .catch((e) => {
        if (!cancelled) setReviewsLoadError(userFacingError(e, USER_ERROR.reviews));
      });
    void getReviewAggregateForListing(listing.id)
      .then((agg) => {
        if (!cancelled) setReviewAggregate(agg);
      })
      .catch(() => {
        /* keep prior — failure ≠ zero reviews */
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadReviews, listing.id]);

  const review = publicReviewLabel(reviewAggregate);
  const reviewScore = review.score;
  const reviewCount = review.count;

  const quickFacts = useMemo(() => {
    const facts: { label: string; value: string; icon: typeof Clock }[] = [];
    facts.push({ label: 'Category', value: rentalCategoryTitle(rental), icon: Package });
    if (item) facts.push({ label: 'Item', value: item, icon: KeyRound });
    facts.push({ label: 'Duration', value: rentalDurationFact(rental), icon: Clock });
    if (place) facts.push({ label: 'Location', value: place, icon: MapPin });
    const cancel = rentalCancellationCustomerText(rental.cancellationPreset);
    if (cancel) facts.push({ label: 'Cancellation', value: cancel.split('.')[0] || cancel, icon: CalendarCheck });
    return facts.slice(0, 6);
  }, [rental, item, place]);

  if (checkoutFromUrl && !draftPreview && !devPreview) {
    return (
      <RentalBookingConfirm
        listing={listing}
        rental={rental}
        initial={checkoutFromUrl}
        onBackToListing={closeRentalBookingConfirm}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page tv-rental-pdp pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="tv-shell mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onNavigate('rentals')}
            className="tv-icon-btn lux-flat inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Rentals</span>
          </button>
          <button
            type="button"
            className="tv-icon-btn lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink"
            aria-label={shareCopied ? 'Link copied' : 'Share'}
            onClick={() => {
              const url = window.location.href;
              const title = listing.title;
              const done = () => {
                setShareCopied(true);
                window.setTimeout(() => setShareCopied(false), 1400);
              };
              if (navigator.share) {
                void navigator.share({ title, url }).then(done).catch(() => {});
              } else if (navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(url).then(done);
              }
            }}
          >
            {shareCopied ? <Check className="h-[17px] w-[17px] tv-pop text-finland" /> : <Share2 size={17} />}
          </button>
        </div>

        {devPreview ? (
          <p className="mb-3 rounded-xl bg-[#F4F6F8] px-3.5 py-2.5 text-sm text-ink" role="note">
            Development preview. This sample is not a public listing, and it cannot be booked or paid for.
          </p>
        ) : null}
        {draftPreview ? (
          <p className="mb-3 rounded-xl bg-[#F4F6F8] px-3.5 py-2.5 text-sm text-ink" role="note">
            Draft preview. Travelers cannot see this listing, and it cannot be booked until Traverion publishes rentals.
          </p>
        ) : null}

        <header className="mb-3 sm:mb-3.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0B397E]">
            {[rentalCategoryTitle(rental), item].filter(Boolean).join(' · ')}
          </p>
          <h1 className="tv-tour-title font-sans font-bold tracking-tight text-[#111827] break-words [overflow-wrap:anywhere]">
            {listing.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <ListingPdpReviewMeta
              score={review.score}
              count={review.count}
              reviewsSectionId="rental-reviews"
            />
            {place ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-ink">
                <MapPin size={14} className="shrink-0 text-[#0B397E]" aria-hidden />
                <span className="font-bold tracking-tight break-words [overflow-wrap:anywhere]">{place}</span>
              </span>
            ) : null}
          </div>
        </header>

        <div className="tv-pdp-layout">
          <div className="tv-pdp-main">
            <ListingPdpPhotoGallery
              photos={photos}
              title={listing.title}
              emptyLabel="No photos yet for this rental"
            />

            {rental.shortIntro || listing.subtitle ? (
              <p className="tv-tour-subtitle mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere]">
                {(rental.shortIntro || listing.subtitle || '').trim()}
              </p>
            ) : null}

            {quickFacts.length > 0 ? (
              <div className="mt-5">
                <ListingPdpQuickFacts facts={quickFacts} />
              </div>
            ) : null}

            {highlights.length > 0 ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Highlights</h2>
                <ListingPdpCheckList items={highlights} />
              </section>
            ) : null}

            {variants.length > 0 ? (
              <section className={sectionClass} aria-labelledby="rental-options-heading">
                <h2 id="rental-options-heading" className={headingClass}>
                  Available options
                </h2>
                <div id="rental-options" role="radiogroup" aria-label="Rental option" className="grid gap-2.5">
                  {variants.map((variant) => {
                    const selected = variant.id === variantId;
                    const rates = rentalOptionRateLabel(rental, effectiveVariantPricing(rental, variant), variant);
                    const attrLine = Object.values(variant.attributes ?? {}).filter(Boolean).join(' · ');
                    const mode = effectiveVariantDurationMode(rental, variant);
                    const modeLabel =
                      mode === 'both' ? 'Hourly or daily' : mode === 'hourly' ? 'Hourly' : 'Daily';
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`tv-tour-option-card flex w-full flex-col px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150 ${
                          selected ? 'tv-tour-option-card--selected' : 'tv-tour-option-card--idle'
                        }`}
                        onClick={() => setVariantId(variant.id)}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-[0.9375rem] font-bold leading-snug tracking-tight text-[#111827]">
                            {variant.name}
                          </span>
                          {rates ? (
                            <span className="shrink-0 text-sm font-bold tabular-nums text-[#111827]">{rates}</span>
                          ) : null}
                        </span>
                        {attrLine ? (
                          <span className="mt-1 text-sm leading-snug text-ink-muted">{attrLine}</span>
                        ) : null}
                        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          <li className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-[#0B397E]" aria-hidden />
                            {modeLabel}
                          </li>
                          {typeof variant.quantity === 'number' && variant.quantity > 0 ? (
                            <li className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                              <Package className="h-3.5 w-3.5 shrink-0 text-[#0B397E]" aria-hidden />
                              Up to {variant.quantity} {variant.quantity === 1 ? units.singular : units.plural}
                            </li>
                          ) : null}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {listing.description?.trim() ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>About this rental</h2>
                <p className="max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere]">
                  {listing.description.trim()}
                </p>
              </section>
            ) : null}

            {specs.length > 0 ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Specifications</h2>
                <dl className="divide-y divide-[#E8EBF0]">
                  {specs.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid gap-1 py-3 sm:grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] sm:items-start sm:gap-6"
                    >
                      <dt className="text-sm font-semibold tracking-tight text-[#111827] whitespace-normal">
                        {rentalSpecLabel(rental, key)}
                      </dt>
                      <dd className="text-sm leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {(rental.inclusions?.length ?? 0) > 0 || rental.insuranceExclusions?.trim() ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>What&apos;s included</h2>
                {(rental.inclusions?.length ?? 0) > 0 ? (
                  <ul className="space-y-2">
                    {rental.inclusions!.map((itemName) => (
                      <li key={itemName} className="flex gap-2.5 text-sm text-ink">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0758CB]" strokeWidth={2.5} aria-hidden />
                        {itemName}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {rental.insuranceExclusions?.trim() ? (
                  <div className={(rental.inclusions?.length ?? 0) > 0 ? 'mt-5' : undefined}>
                    <h3 className="mb-2 text-sm font-bold tracking-tight text-[#111827]">Not included</h3>
                    <p className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                      {rental.insuranceExclusions.trim()}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className={sectionClass}>
              <h2 className={headingClass}>Pickup and return</h2>
              <dl className="divide-y divide-[#E8EBF0]">
                <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                  <dt className="text-sm font-semibold tracking-tight text-[#111827]">Pickup</dt>
                  <dd className="space-y-1 text-sm leading-relaxed text-ink-muted">
                    <p>{rental.pickupAddress || 'The operator shares the pickup place after booking.'}</p>
                    {rentalPickupHandoverLabel(rental) ? <p>{rentalPickupHandoverLabel(rental)}</p> : null}
                    {rental.pickupInstructions ? <p>{rental.pickupInstructions}</p> : null}
                    {rental.collectionNotes?.trim() ? <p>{rental.collectionNotes.trim()}</p> : null}
                  </dd>
                </div>
                <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:items-start sm:gap-5">
                  <dt className="text-sm font-semibold tracking-tight text-[#111827]">Return</dt>
                  <dd className="space-y-1 text-sm leading-relaxed text-ink-muted">
                    <p>
                      {returnPoint.sameAsPickup
                        ? returnPoint.address
                          ? `Same place as pickup · ${returnPoint.address}`
                          : 'Same place as pickup'
                        : returnPoint.address || 'The operator shares the return place after booking.'}
                    </p>
                    {rentalReturnHandoverLabel(rental) ? <p>{rentalReturnHandoverLabel(rental)}</p> : null}
                    {!returnPoint.sameAsPickup && rental.returnInstructions ? (
                      <p>{rental.returnInstructions}</p>
                    ) : null}
                    {rental.returnCollectionNotes?.trim() ? <p>{rental.returnCollectionNotes.trim()}</p> : null}
                  </dd>
                </div>
              </dl>
              {typeof rental.pickupLat === 'number' && typeof rental.pickupLng === 'number' ? (
                <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-[#E8EBF0]">
                  <RentalCollectionMap
                    lat={rental.pickupLat}
                    lng={rental.pickupLng}
                    compact
                    label={returnPoint.sameAsPickup ? 'Pickup and return map' : 'Pickup location map'}
                  />
                </div>
              ) : null}
              {!returnPoint.sameAsPickup && returnPoint.lat != null && returnPoint.lng != null ? (
                <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-[#E8EBF0]">
                  <RentalCollectionMap
                    lat={returnPoint.lat}
                    lng={returnPoint.lng}
                    compact
                    label="Return location map"
                  />
                </div>
              ) : null}
              {hours.length > 0 ? (
                <div className="mt-5">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#111827]">
                    <Clock className="h-4 w-4 text-[#0B397E]" aria-hidden />
                    Hours
                  </p>
                  <ul className="space-y-1.5 text-sm text-ink-muted">
                    {hours.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {durationRows.length > 0 ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Rental length</h2>
                <ul className="max-w-xl space-y-3">
                  {durationRows.map((row) => {
                    const Icon = row.key === 'hour' ? Clock : Calendar;
                    return (
                      <li key={row.key} className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5F7FA] text-[#0B397E]">
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-sm font-bold leading-snug tracking-tight text-[#111827]">
                            {row.title}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-ink-muted">{row.range}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {requirements.length > 0 ||
            rental.idRequired ||
            rental.rentalRules?.trim() ||
            rental.accessibilityStatus === 'details_provided' ||
            (rental.difficulty && rental.difficulty !== 'not_applicable') ||
            rental.suitableFor?.trim() ||
            rental.notSuitableFor?.trim() ||
            rentalCustomerSkillSuitability(rental) ||
            (rental.restrictions ?? []).length > 0 ? (
              <section className={sectionClass}>
                <h2 className={headingClass}>Requirements and suitability</h2>
                {requirements.length > 0 || rental.idRequired ? (
                  <ul className="space-y-2 text-sm text-ink">
                    {rental.idRequired ? (
                      <li className="flex gap-2">
                        <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#0B397E]" aria-hidden />
                        Valid ID required at pickup
                      </li>
                    ) : null}
                    {requirements.map(([key, value]) => (
                      <li key={key} className="flex gap-2">
                        <BadgeInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#0B397E]" aria-hidden />
                        <span>
                          <span className="font-medium">{rentalRequirementLabel(rental, key)}:</span> {value}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {rental.rentalRules?.trim() ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                    {rental.rentalRules.trim()}
                  </p>
                ) : null}
                {rental.difficulty === 'easy' ? <p className="mt-3 text-sm text-ink">Difficulty: Easy</p> : null}
                {rental.difficulty === 'moderate' ? (
                  <p className="mt-3 text-sm text-ink">Difficulty: Moderate</p>
                ) : null}
                {rental.difficulty === 'challenging' ? (
                  <p className="mt-3 text-sm text-ink">Difficulty: Challenging</p>
                ) : null}
                {rentalCustomerSkillSuitability(rental) ? (
                  <p className="mt-2 text-sm text-ink">Skill suitability: {rentalCustomerSkillSuitability(rental)}</p>
                ) : null}
                {rental.suitableFor?.trim() ? (
                  <p className="mt-2 text-sm text-ink">Suitable for: {rental.suitableFor.trim()}</p>
                ) : null}
                {rental.notSuitableFor?.trim() ? (
                  <p className="mt-2 text-sm text-ink-muted">Not suitable for: {rental.notSuitableFor.trim()}</p>
                ) : null}
                {rental.accessibilityStatus === 'details_provided' ? (
                  <div className="mt-3">
                    <ul className="space-y-1 text-sm text-ink">
                      {(rental.accessibilityFeatures ?? []).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {rental.accessibilityNotes?.trim() ? (
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{rental.accessibilityNotes.trim()}</p>
                    ) : null}
                  </div>
                ) : null}
                {(rental.restrictions ?? []).length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-ink">
                    {(rental.restrictions ?? []).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            <ListingPdpPolicyBlock
              className={sectionClass}
              title="Cancellation and deposit"
              body={[
                rentalCancellationCustomerText(rental.cancellationPreset),
                `Security deposit: ${rentalDepositCustomerText(rental)}`,
              ]
                .filter(Boolean)
                .join('\n\n')}
            />
          </div>

          <div className="tv-pdp-aside min-w-0">
            <aside
              id="rental-booking"
              className="tv-booking-sticky tv-booking-sticky--fit tv-booking-sticky--rental scroll-mt-28 h-fit lg:sticky lg:top-[calc(4.75rem+env(safe-area-inset-top,0px))]"
            >
              <RentalBookingWidget
                key={[
                  widgetInitial.variantId ?? '',
                  widgetInitial.startDate ?? '',
                  widgetInitial.endDate ?? '',
                  widgetInitial.pickupHm ?? '',
                  widgetInitial.returnHm ?? '',
                  String(widgetInitial.quantity ?? ''),
                  widgetInitial.durationUnit ?? '',
                ].join('|')}
                listingId={listing.id}
                rental={rental}
                timeZone={listing.listingExtras?.departureTimezone}
                initial={widgetInitial}
                variantId={variantId}
                onVariantIdChange={setVariantId}
                hideOptionPicker
                onContinue={openRentalBookingConfirm}
              />
            </aside>
          </div>
        </div>
      </div>

      {canLoadReviews || supplierLegal ? (
        <div className="tv-shell mx-auto mt-2 px-4 sm:px-6 lg:px-8">
          {canLoadReviews ? (
            <div id="rental-reviews" className="tv-pdp-below border-t border-[#E8EBF0] pt-8 scroll-mt-28">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 className="tv-section-heading">Reviews</h2>
                {reviews.length > 0 ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-finland hover:underline"
                    onClick={() => setReviewsModalOpen(true)}
                  >
                    See all reviews
                  </button>
                ) : null}
              </div>
              {reviewScore && reviewCount > 0 ? (
                <div className="mb-4 flex items-center gap-3">
                  <p className="text-4xl font-bold tabular-nums leading-none tracking-tight text-[#111827]">
                    {reviewScore}
                  </p>
                  <div>
                    <p className="text-sm text-ink-muted">
                      {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                    </p>
                  </div>
                </div>
              ) : null}
              {reviewsLoadError ? (
                <p className="mb-4 text-sm text-ink-muted">{reviewsLoadError}</p>
              ) : reviews.length === 0 ? (
                <div className="mb-4 flex items-start gap-3 py-1">
                  <Star size={20} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
                  <div>
                    <p className="text-sm font-bold tracking-tight text-[#111827]">No reviews yet</p>
                    <p className="mt-0.5 max-w-md text-sm leading-relaxed text-ink-muted">
                      {LISTING_REVIEWS_EMPTY_COPY}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mb-6 grid items-start gap-4 sm:grid-cols-2">
                  {reviews.slice(0, 4).map((r) => (
                    <PublicReviewCard key={r.id} review={r} reply={reviewReplies[r.id] ?? null} />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {supplierLegal ? (
            <div className="tv-pdp-below mt-2 mb-8">
              <TourOperatorBlock
                supplierLegal={supplierLegal}
                onOpenLegal={setLegalModal}
                heading="About the provider"
                subtitle="Rental provider on Traverion"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="tv-booking-mobile-bar fixed inset-x-0 bottom-0 z-[60] lg:hidden">
        <div className="mx-auto flex w-full min-w-0 max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-base font-bold tracking-tight text-ink">
              {fromPrice ? (
                <>
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">From </span>
                  <span className="tabular-nums">{fromPrice.label}</span>
                </>
              ) : (
                'Review dates'
              )}
            </p>
            <p className="tv-meta truncate">Option, dates, and quantity</p>
          </div>
          <a href="#rental-booking" className="tv-btn-primary shrink-0 px-5 font-semibold">
            Continue
          </a>
        </div>
      </div>

      <ListingReviewsModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        reviews={reviews}
        replies={reviewReplies}
        listingTitle={listing.title}
      />

      {legalModal && supplierLegal ? (
        <div className="tv-gallery-lightbox" role="dialog" aria-modal="true" ref={legalSheetRef} tabIndex={-1}>
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-paper">
            <div className="flex items-center justify-between border-b border-[#E8EBF0] px-4 py-3">
              <h2 className="font-sans text-lg font-bold text-[#111827]">
                {legalModal === 'privacy' ? 'Privacy policy' : 'Terms & conditions'}
              </h2>
              <button type="button" className="tv-icon-btn lux-flat h-10 w-10 rounded-full" onClick={closeLegalModal}>
                <X className="h-5 w-5" aria-hidden />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                {legalModal === 'privacy'
                  ? supplierLegal.privacy_policy_text
                  : supplierLegal.terms_conditions_text}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
