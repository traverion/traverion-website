import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Users } from 'lucide-react';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { parseListingExtras } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingIsFamily } from '../lib/inventory';
import { useAuth } from '../contexts/AuthContext';
import { rememberTravelerReturnStay, travelerLoginHref } from '../lib/travelerAuthLinks';
import { quoteStayNights, stayQuotePriceLines } from '../lib/booking-quote';
import { stayDateRangesOverlap, nightsOccupiedByStay } from '../lib/stayOccupancy';
import { createBookingCheckoutSession, fetchPublishedStayOccupiedRanges } from '../data/supabase-bookings';
import { fetchSupplierPublicLegal } from '../data/supabase-supplier-profile';
import type { TourPackage } from '../types/tour';
import ErrorState from '../components/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { setPageMetaWithOg } from '../lib/seo';
import { formatMoney, normalizeCurrency } from '../lib/money';
import PriceBreakdown, { PriceHero } from '../components/PriceBreakdown';
import StayNightPicker from '../components/StayNightPicker';
import NoticeCallout from '../components/NoticeCallout';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { CHECKOUT_HOLD_MINUTES } from '../lib/booking-hold';
import { formatOccupiedNightRanges, formatStayNightHuman } from '../lib/stay-calendar';

type Props = {
  stayId: string;
  onBack: () => void;
};

function readStayPrefill(): { checkIn: string; checkOut: string; guests: number } {
  if (typeof window === 'undefined') return { checkIn: '', checkOut: '', guests: 2 };
  const p = new URLSearchParams(window.location.search);
  const checkIn = (p.get('date') ?? p.get('checkIn') ?? '').trim();
  const checkOut = (p.get('checkout') ?? p.get('checkOut') ?? '').trim();
  const g = Number.parseInt(p.get('guests') ?? '', 10);
  return {
    checkIn: /^\d{4}-\d{2}-\d{2}$/.test(checkIn) ? checkIn : '',
    checkOut: /^\d{4}-\d{2}-\d{2}$/.test(checkOut) ? checkOut : '',
    guests: Number.isFinite(g) && g >= 1 ? Math.min(99, Math.floor(g)) : 2,
  };
}

export default function StayDetails({ stayId, onBack }: Props) {
  const { user } = useAuth();
  const [stay, setStay] = useState<TourPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState(() => readStayPrefill().checkIn);
  const [checkOut, setCheckOut] = useState(() => readStayPrefill().checkOut);
  const [guests, setGuests] = useState(() => readStayPrefill().guests);
  const [paying, setPaying] = useState(false);
  const checkoutLockRef = useRef(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [occupiedRanges, setOccupiedRanges] = useState<{ checkIn: string; checkOut: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void getListingByIdAsync(stayId).then((row) => {
      if (cancelled) return;
      const found = row ?? getListingById(stayId) ?? null;
      if (!found || !listingIsFamily(found, 'stay')) {
        setStay(null);
        setError('This stay is not available.');
        return;
      }
      setStay(found);
    });
    return () => {
      cancelled = true;
    };
  }, [stayId]);

  useEffect(() => {
    if (!stay) {
      setPageMetaWithOg('Stay', 'Apartment or room from an independent operator.');
      return;
    }
    const desc = stay.description?.trim().slice(0, 160) || `${stay.title} in ${[stay.city, stay.country].filter(Boolean).join(', ')}`;
    setPageMetaWithOg(stay.title, desc, {
      title: stay.title,
      image: stay.image,
      type: 'website',
    });
  }, [stay]);

  useEffect(() => {
    if (!stay?.supplierId) {
      setHostName(null);
      return;
    }
    void fetchSupplierPublicLegal(stay.supplierId).then((row) => {
      const name = row?.company_legal_name?.trim() || row?.display_name?.trim() || null;
      setHostName(name);
    });
  }, [stay?.supplierId]);

  useEffect(() => {
    if (!stay?.id) {
      setOccupiedRanges([]);
      return;
    }
    void fetchPublishedStayOccupiedRanges(stay.id).then(setOccupiedRanges);
  }, [stay?.id]);
  const extras = stay ? parseListingExtras(stay.listingExtras) : {};
  const s = extras.stay;
  const gallery = (extras.galleryImageUrls ?? []).map((u) => String(u).trim()).filter(Boolean);
  const stayQuote = stay
    ? quoteStayNights({
        tour: stay,
        checkIn,
        checkOut,
        guests,
      })
    : null;
  const nightly = stayQuote?.ok ? stayQuote.nightlyPrice : s?.nightlyPriceUsd && s.nightlyPriceUsd > 0 ? s.nightlyPriceUsd : stay?.price.startingFrom ?? 0;
  const nights = stayQuote?.ok ? stayQuote.nights : null;
  const minNights = s?.minNights ?? 1;
  const maxGuests = s?.maxGuests ?? 12;
  const quoteOk = stayQuote?.ok === true;
  const total = stayQuote?.ok ? stayQuote.totalAmount : 0;
  const currency = normalizeCurrency(stay?.price.currency);
  const occupiedNights = occupiedRanges.flatMap((r) => nightsOccupiedByStay(r.checkIn, r.checkOut));
  const selectionOccupied =
    checkIn && checkOut ? occupiedRanges.some((r) => stayDateRangesOverlap(checkIn, checkOut, r.checkIn, r.checkOut)) : false;
  const hero = stay ? listingHeroImageSrc(stay.image) : undefined;

  const amenityLine = useMemo(() => (s?.amenities ?? []).filter(Boolean).join(' · '), [s?.amenities]);

  const startStayCheckout = () => {
    if (!stay || !stayQuote?.ok) {
      document.getElementById('stay-checkin')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (selectionOccupied) {
      setPayError('Those dates were just booked by another traveler. Choose different dates to continue.');
      return;
    }
    if (checkoutLockRef.current || paying) return;
    checkoutLockRef.current = true;
    setPaying(true);
    setPayError(null);
    void createBookingCheckoutSession({
      listingId: stay.id,
      listingTitle: stay.title,
      bookingDate: stayQuote.checkIn,
      checkoutDate: stayQuote.checkOut,
      guests: stayQuote.guests,
      currency: stayQuote.currency,
      successPath: '/booking-confirmed',
      cancelPath: '/stays?payment=cancelled',
    }).then((res) => {
      setPaying(false);
      checkoutLockRef.current = false;
      if (!res.success || !res.checkoutUrl) {
        setPayError(userFacingError(res.error, 'Checkout could not start. You were not charged.'));
        return;
      }
      window.location.assign(res.checkoutUrl);
    });
  };

  if (error && !stay) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-lg mx-auto px-4 py-16">
          <ErrorState title="Stay unavailable" body={error} back={{ onClick: onBack, label: 'Back to stays' }} />
        </div>
      </div>
    );
  }

  if (!stay) {
    return (
      <div className="min-h-screen bg-paper tv-page px-4 py-16">
        <Skeleton className="mx-auto h-64 max-w-3xl rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-24">
        <button type="button" onClick={onBack} className="tv-btn-ghost mb-6 -ml-2">
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back to stays
        </button>
        {hero ? (
          <img src={hero} alt="" className="w-full h-[22rem] sm:h-[28rem] object-cover rounded-3xl mb-3" />
        ) : (
          <div className="w-full h-64 rounded-3xl bg-ink/10 mb-3" />
        )}
        {gallery.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 mb-8">
            {gallery.slice(0, 3).map((url) => (
              <img key={url} src={listingHeroImageSrc(url) ?? url} alt="" className="h-24 sm:h-32 w-full object-cover rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mb-8" />
        )}
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Stay</p>
        <p className="text-ink-muted flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4" aria-hidden />
          {[stay.city, stay.country].filter(Boolean).join(', ') || stay.destination}
        </p>
        <h1 className="font-display text-3xl sm:text-5xl text-ink tracking-tight mb-4">{stay.title}</h1>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted mb-10">
          {typeof s?.maxGuests === 'number' ? <span>Up to {s.maxGuests} guests</span> : null}
          {typeof s?.bedrooms === 'number' ? (
            <span>{s.bedrooms === 1 ? '1 bedroom' : `${s.bedrooms} bedrooms`}</span>
          ) : null}
          {typeof s?.beds === 'number' ? (
            <span>{s.beds === 1 ? '1 bed' : `${s.beds} beds`}</span>
          ) : null}
          {typeof s?.bathrooms === 'number' ? (
            <span>{s.bathrooms === 1 ? '1 bath' : `${s.bathrooms} baths`}</span>
          ) : null}
              {nightly > 0 ? (
            <span className="text-ink font-semibold tabular-nums">
              {formatMoney(nightly, currency)} per night
            </span>
          ) : null}
        </p>

        <div className="grid lg:grid-cols-[1fr_20rem] gap-10 pb-24 lg:pb-0">
          <div className="space-y-10 text-[15px] leading-relaxed text-ink">
            {stay.description ? (
              <div>
                <h2 className="font-display text-2xl mb-3">The place</h2>
                <p className="text-ink-muted">{stay.description}</p>
              </div>
            ) : null}
            <div>
              <h2 className="font-display text-2xl mb-3">Sleeping</h2>
              <ul className="space-y-2 text-ink-muted">
              {s?.propertyType ? <li>{s.propertyType}</li> : null}
              {typeof s?.bedrooms === 'number' ? (
                <li>{s.bedrooms === 1 ? '1 bedroom' : `${s.bedrooms} bedrooms`}</li>
              ) : null}
              {typeof s?.beds === 'number' ? <li>{s.beds === 1 ? '1 bed' : `${s.beds} beds`}</li> : null}
              {typeof s?.bathrooms === 'number' ? (
                <li>{s.bathrooms === 1 ? '1 bath' : `${s.bathrooms} baths`}</li>
              ) : null}
              {typeof s?.maxGuests === 'number' ? (
                <li className="flex items-center gap-2">
                  <Users className="w-4 h-4" aria-hidden /> Up to {s.maxGuests} guests
                </li>
              ) : null}
              </ul>
            </div>
            {amenityLine ? (
              <div>
                <h2 className="font-display text-2xl mb-3">Amenities</h2>
                <p className="text-ink-muted">{amenityLine}</p>
              </div>
            ) : null}
            <div>
              <h2 className="font-display text-2xl mb-3">Availability</h2>
              <p className="text-ink-muted leading-relaxed">
                Minimum stay {minNights === 1 ? '1 night' : `${minNights} nights`}
                {typeof s?.maxGuests === 'number' ? ` · up to ${s.maxGuests} guests` : ''}.
                Checkout night is not occupied. If you pick nights that are already taken, booking is refused.
              </p>
              {occupiedNights.length > 0 ? (
                <p className="mt-3 text-sm text-ink">
                  Currently booked: {formatOccupiedNightRanges(occupiedNights.slice(0, 24))}
                  {occupiedNights.length > 24 ? '…' : ''}
                </p>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">
                  No nights are occupied yet. Choose check-in and check-out on the booking panel.
                </p>
              )}
            </div>
            {s?.checkInTime || s?.checkOutTime ? (
              <div>
                <h2 className="font-display text-2xl mb-3">Check-in & check-out</h2>
                <ul className="space-y-2 text-ink-muted">
                  {s?.checkInTime ? <li>Check-in from {s.checkInTime}</li> : null}
                  {s?.checkOutTime ? <li>Check-out by {s.checkOutTime}</li> : null}
                </ul>
              </div>
            ) : null}
            {s?.houseRules ? (
              <div>
                <h2 className="font-display text-2xl mb-2">House rules</h2>
                <p className="text-ink-muted whitespace-pre-wrap">{s.houseRules}</p>
              </div>
            ) : null}
            <div>
              <h2 className="font-display text-2xl mb-2">Cancellation</h2>
              <p className="text-ink-muted">
                You may cancel free of charge up to 24 hours before check-in. After that, guest-initiated cancellations are not available. If the operator cancels, that is handled from your booking details.
              </p>
            </div>
            {hostName ? (
              <div>
                <h2 className="font-display text-2xl mb-2">Host</h2>
                <p className="text-ink-muted">{hostName}</p>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 h-fit rounded-2xl bg-paper-raised p-5 shadow-soft-lg">
            {nightly > 0 ? (
              <PriceHero
                amount={nightly}
                currency={currency}
                basis={minNights === 1 ? 'per night · 1 night minimum' : `per night · ${minNights} nights minimum`}
              />
            ) : (
              <p className="text-lg font-semibold text-ink">—</p>
            )}
            <div className="mt-4">
              <StayNightPicker
                checkIn={checkIn}
                checkOut={checkOut}
                occupiedNights={occupiedNights}
                todayIso={new Date().toISOString().slice(0, 10)}
                minNights={minNights}
                onChange={(a, b) => {
                  setCheckIn(a);
                  setCheckOut(b);
                  setPayError(null);
                }}
              />
            </div>
            <p className="mt-3 text-sm text-ink">
              {checkIn ? formatStayNightHuman(checkIn) : 'Check-in'}
              {' → '}
              {checkOut ? formatStayNightHuman(checkOut) : 'Check-out'}
            </p>
            <label className="mt-3 block text-sm font-medium text-ink" htmlFor="stay-guests">
              Guests
            </label>
            <input
              id="stay-guests"
              type="number"
              min={1}
              max={maxGuests}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value) || 1)}
              className="tv-input mt-1 w-full"
            />
            {nights != null && nights < minNights ? (
              <div className="mt-3">
                <NoticeCallout title="Minimum stay not met" tone="warn">
                  This stay requires at least {minNights === 1 ? '1 night' : `${minNights} nights`}. Extend check-out to
                  continue.
                </NoticeCallout>
              </div>
            ) : null}
            {selectionOccupied ? (
              <div className="mt-3">
                <NoticeCallout title="Those nights are taken" tone="danger">
                  Another traveler already has this stay on those dates. Choose a different range.
                </NoticeCallout>
              </div>
            ) : null}
            {quoteOk && stayQuote?.ok ? (
              <div className="mt-4">
                <PriceBreakdown
                  currency={stayQuote.currency}
                  lines={stayQuotePriceLines(stayQuote)}
                  total={stayQuote.totalAmount}
                  holdNote={`Nights are held for ${CHECKOUT_HOLD_MINUTES} minutes after you continue to Stripe.`}
                />
              </div>
            ) : null}
            {stayQuote && !stayQuote.ok && checkIn && checkOut ? (
              <p className="mt-3 text-sm text-red-700">{userFacingError(stayQuote.error, USER_ERROR.checkout)}</p>
            ) : null}
            {user ? (
              <>
                {payError ? <p className="mt-3 text-sm text-red-700">{payError}</p> : null}
                <button
                  type="button"
                  className="tv-btn-primary w-full mt-4 disabled:opacity-50"
                  disabled={!quoteOk || paying || selectionOccupied}
                  onClick={startStayCheckout}
                >
                  {paying ? 'Opening checkout…' : 'Continue to payment'}
                </button>
                <p className="mt-3 text-xs text-ink-muted leading-relaxed">
                  Price is confirmed on the server. If checkout cannot start, you will see an error — never a fake success.
                </p>
              </>
            ) : (
              <a
                href={travelerLoginHref('stays')}
                className="tv-btn-primary w-full mt-4"
                onClick={() => rememberTravelerReturnStay(stay.id)}
              >
                Log in to continue
              </a>
            )}
          </aside>
        </div>
      </div>
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-black/[0.06] bg-paper-raised px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <p className="text-sm text-ink min-w-0">
            <span className="font-semibold">
              {quoteOk ? formatMoney(total, currency) : nightly > 0 ? formatMoney(nightly, currency) : '—'}
            </span>
            <span className="text-ink-muted"> {quoteOk ? 'total' : 'per night'}</span>
          </p>
          {user ? (
            <button
              type="button"
              className="tv-btn-primary shrink-0 disabled:opacity-50"
              disabled={paying}
              onClick={startStayCheckout}
            >
              {quoteOk ? (paying ? 'Opening…' : 'Continue to payment') : 'Select dates'}
            </button>
          ) : (
            <a
              href={travelerLoginHref('stays')}
              className="tv-btn-primary shrink-0"
              onClick={() => rememberTravelerReturnStay(stay.id)}
            >
              Log in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
