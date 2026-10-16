import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  autocompletePlaces,
  placesSearchConfigured,
  resolvePlace,
  type PlaceSuggestion,
} from '../../lib/places-client';
import type { TravelerPickupPoint } from '../../lib/pickup-area';

type Props = {
  id: string;
  label: string;
  bias?: { lat: number; lng: number; radiusKm: number } | null;
  selected: TravelerPickupPoint | null;
  onSelect: (place: TravelerPickupPoint | null) => void;
  placeholder?: string;
};

export default function PickupLocationSearch({
  id,
  label,
  bias,
  selected,
  onSelect,
  placeholder = 'Hotel or address',
}: Props) {
  const configured = placesSearchConfigured();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!configured || query.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    const biasLat = bias?.lat;
    const biasLng = bias?.lng;
    const biasKm = bias?.radiusKm;
    const timer = window.setTimeout(() => {
      void autocompletePlaces(
        query,
        biasLat != null && biasLng != null && biasKm != null
          ? { lat: biasLat, lng: biasLng, radiusKm: biasKm }
          : undefined
      )
        .then((next) => {
          if (cancelled) return;
          setItems(next);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setSearchError('Location search is unavailable.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bias?.lat, bias?.lng, bias?.radiusKm, configured, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = async (suggestion: PlaceSuggestion) => {
    setResolving(true);
    setSearchError(null);
    try {
      const place = await resolvePlace(suggestion.placeId);
      if (!place) {
        setSearchError('That place could not be loaded.');
        return;
      }
      onSelect({
        placeId: place.placeId,
        name: place.name,
        formattedAddress: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
      });
      setQuery('');
      setOpen(false);
      setItems([]);
    } catch {
      setSearchError('That place could not be loaded.');
    } finally {
      setResolving(false);
    }
  };

  if (selected) {
    return (
      <div className="rounded-xl border border-black/10 bg-white px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
        <p className="mt-1 text-sm font-bold text-ink break-words">{selected.name || selected.formattedAddress}</p>
        {selected.name && selected.formattedAddress && selected.name !== selected.formattedAddress ? (
          <p className="mt-0.5 text-sm text-ink-muted break-words">{selected.formattedAddress}</p>
        ) : null}
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-finland hover:underline"
          onClick={() => onSelect(null)}
        >
          Change location
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {configured ? (
        <>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && items[active] ? `${id}-opt-${active}` : undefined}
              value={query}
              placeholder={placeholder}
              autoComplete="off"
              className="tv-checkout-input"
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                if (items.length > 0) setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOpen(true);
                  setActive((index) => Math.min(items.length - 1, index + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((index) => Math.max(0, index - 1));
                } else if (event.key === 'Enter' && open && items[active]) {
                  event.preventDefault();
                  void choose(items[active]);
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
          </div>
          {loading || resolving ? <p className="mt-1.5 text-xs text-ink-muted">Searching locations…</p> : null}
          {searchError ? (
            <p className="mt-1.5 text-xs text-red-700" role="alert">
              {searchError}
            </p>
          ) : null}
          {open && items.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg"
            >
              {items.map((item, index) => (
                <li key={item.placeId} id={`${id}-opt-${index}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left ${
                      index === active ? 'bg-finland/10' : 'hover:bg-black/[0.03]'
                    }`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => void choose(item)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-finland" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{item.name}</span>
                      {item.address ? <span className="block text-xs text-ink-muted">{item.address}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {open && !loading && query.trim().length >= 2 && items.length === 0 && !searchError ? (
            <p className="mt-1.5 text-xs text-ink-muted">No matching locations.</p>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Location search needs <span className="font-semibold">VITE_GOOGLE_MAPS_API_KEY</span>. A typed address is not
          accepted as a pickup location.
        </p>
      )}
    </div>
  );
}
