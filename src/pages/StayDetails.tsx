import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Users } from 'lucide-react';
import { getListingById, getListingByIdAsync } from '../data/listings';
import { parseListingExtras } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingIsFamily } from '../lib/inventory';
import { useAuth } from '../contexts/AuthContext';
import { rememberTravelerReturnStay, travelerLoginHref } from '../lib/travelerAuthLinks';
import type { TourPackage } from '../types/tour';
import ErrorState from '../components/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';

type Props = {
  stayId: string;
  onBack: () => void;
};

function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  const a = Date.parse(`${checkIn}T12:00:00Z`);
  const b = Date.parse(`${checkOut}T12:00:00Z`);
  const n = Math.round((b - a) / 86400000);
  return n >= 1 ? n : null;
}

export default function StayDetails({ stayId, onBack }: Props) {
  const { user } = useAuth();
  const [stay, setStay] = useState<TourPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

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

  const extras = stay ? parseListingExtras(stay.listingExtras) : {};
  const s = extras.stay;
  const gallery = (extras.galleryImageUrls ?? []).map((u) => String(u).trim()).filter(Boolean);
  const nightly = s?.nightlyPriceUsd && s.nightlyPriceUsd > 0 ? s.nightlyPriceUsd : stay?.price.startingFrom ?? 0;
  const nights = nightsBetween(checkIn, checkOut);
  const minNights = s?.minNights ?? 1;
  const maxGuests = s?.maxGuests ?? 12;
  const cleaning = s?.cleaningFeeUsd ?? 0;
  const quoteOk = nights != null && nights >= minNights && guests >= 1 && guests <= maxGuests && nightly > 0;
  const total = quoteOk && nights ? nights * nightly + cleaning : 0;
  const currency = (stay?.price.currency ?? 'USD').toUpperCase();
  const hero = stay ? listingHeroImageSrc(stay.image) : undefined;

  const amenityLine = useMemo(() => (s?.amenities ?? []).filter(Boolean).join(' · '), [s?.amenities]);

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
        <h1 className="font-display text-3xl sm:text-5xl text-ink tracking-tight mb-2">{stay.title}</h1>
        <p className="text-ink-muted flex items-center gap-2 mb-8">
          <MapPin className="w-4 h-4" aria-hidden />
          {[stay.city, stay.country].filter(Boolean).join(', ') || stay.destination}
        </p>

        <div className="grid lg:grid-cols-[1fr_20rem] gap-10">
          <div className="space-y-8 text-[15px] leading-relaxed text-ink">
            {stay.description ? <p className="text-ink-muted">{stay.description}</p> : null}
            <ul className="space-y-2 text-ink-muted">
              {s?.propertyType ? <li>{s.propertyType}</li> : null}
              {typeof s?.bedrooms === 'number' ? <li>{s.bedrooms} bedroom{s.bedrooms === 1 ? '' : 's'}</li> : null}
              {typeof s?.beds === 'number' ? <li>{s.beds} bed{s.beds === 1 ? '' : 's'}</li> : null}
              {typeof s?.bathrooms === 'number' ? <li>{s.bathrooms} bath{s.bathrooms === 1 ? '' : 's'}</li> : null}
              {typeof s?.maxGuests === 'number' ? (
                <li className="flex items-center gap-2">
                  <Users className="w-4 h-4" aria-hidden /> Up to {s.maxGuests} guests
                </li>
              ) : null}
              {amenityLine ? <li>{amenityLine}</li> : null}
              {s?.checkInTime ? <li>Check-in from {s.checkInTime}</li> : null}
              {s?.checkOutTime ? <li>Check-out by {s.checkOutTime}</li> : null}
            </ul>
            {s?.houseRules ? (
              <div>
                <h2 className="font-display text-2xl mb-2">House rules</h2>
                <p className="text-ink-muted whitespace-pre-wrap">{s.houseRules}</p>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 h-fit rounded-2xl bg-paper-raised p-5 shadow-soft-lg">
            <p className="text-lg font-semibold text-ink">
              {currency} {nightly > 0 ? nightly.toFixed(0) : '—'}
              <span className="text-sm font-normal text-ink-muted"> / night</span>
            </p>
            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="stay-checkin">
              Check-in
            </label>
            <input
              id="stay-checkin"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="tv-input mt-1 w-full"
            />
            <label className="mt-3 block text-sm font-medium text-ink" htmlFor="stay-checkout">
              Check-out
            </label>
            <input
              id="stay-checkout"
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="tv-input mt-1 w-full"
            />
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
              <p className="mt-3 text-sm text-red-700">Minimum stay is {minNights} night{minNights === 1 ? '' : 's'}.</p>
            ) : null}
            {quoteOk ? (
              <p className="mt-3 text-sm text-ink-muted">
                {nights} night{nights === 1 ? '' : 's'}
                {cleaning > 0 ? ` + ${currency} ${cleaning.toFixed(0)} cleaning` : ''}
                {' · '}
                <strong className="text-ink">
                  {currency} {total.toFixed(0)}
                </strong>
              </p>
            ) : null}
            {user ? (
              <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                Stay checkout is not open yet. You will never see a fake success — when nights can be charged, the same Stripe flow as tours will be used.
              </p>
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
    </div>
  );
}
