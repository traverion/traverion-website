import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin } from 'lucide-react';
import { computeAnchoredActionMenuBox } from '../../../lib/anchored-popover';
import { autocompleteAddresses, placesSearchConfigured, resolveAddress, type PlaceSuggestion } from '../../../lib/places-client';
import RentalCollectionMap from './RentalCollectionMap';

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

type Props = {
  id: string;
  label: string;
  address: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
  bias: { lat: number; lng: number } | null;
  onSelect: (selection: { address: string; lat: number; lng: number }) => void;
  onMovePin: (point: { lat: number; lng: number }) => void;
  onAddressText: (address: string) => void;
};

export default function RentalCollectionPoint({
  id,
  label,
  address,
  lat,
  lng,
  bias,
  onSelect,
  onMovePin,
  onAddressText,
}: Props) {
  const listId = useId();
  const configured = placesSearchConfigured();
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolveSeq = useRef(0);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const hasPin = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    function place() {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const rowCount = Math.max(suggestions.length, empty || loading ? 1 : 0);
      const estimatedHeight = Math.min(280, Math.max(48, rowCount * 56 + 8));
      const box = computeAnchoredActionMenuBox({
        anchorRect: rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        preferredWidth: rect.width,
        estimatedHeight,
        align: 'start',
        gap: 4,
        edge: 8,
      });
      setMenuBox({ top: box.top, left: box.left, width: box.width });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, suggestions.length, loading, empty]);

  useEffect(() => {
    if (!open || !configured) {
      setSuggestions([]);
      setLoading(false);
      setEmpty(false);
      return;
    }
    const query = (draft ?? '').trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setEmpty(false);
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      setEmpty(false);
      void autocompleteAddresses(query, { bias, signal: abort.signal })
        .then((rows) => {
          if (abort.signal.aborted) return;
          setSuggestions(rows);
          setActiveIndex(0);
          setEmpty(rows.length === 0);
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted || isAbortError(err)) return;
          setSuggestions([]);
          setEmpty(false);
          setError(err instanceof Error ? err.message : 'Address search is unavailable.');
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [bias, configured, draft, open]);

  async function choose(suggestion: PlaceSuggestion) {
    const seq = resolveSeq.current + 1;
    resolveSeq.current = seq;
    setResolving(true);
    setError(null);
    try {
      const place = await resolveAddress(suggestion.placeId);
      if (resolveSeq.current !== seq) return;
      const formatted = place?.formattedAddress?.trim() ?? '';
      if (!place || formatted.length < 5 || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
        setError('That address has no map location. Choose another suggestion.');
        return;
      }
      onSelect({ address: formatted.slice(0, 240), lat: place.lat, lng: place.lng });
      setDraft(null);
      setOpen(false);
      setSuggestions([]);
      setEmpty(false);
    } catch (err) {
      if (resolveSeq.current !== seq) return;
      setError(err instanceof Error ? err.message : 'That address could not be loaded.');
    } finally {
      if (resolveSeq.current === seq) setResolving(false);
    }
  }

  const shown = draft ?? address;
  const menu =
    open && menuBox && (suggestions.length > 0 || empty) ? (
      <ul
        id={listId}
        role="listbox"
        style={{ position: 'fixed', top: menuBox.top, left: menuBox.left, width: menuBox.width }}
        className="z-[90] max-h-60 overflow-auto rounded-xl border border-[#E6EAF0] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
      >
        {empty ? (
          <li className="px-3 py-2 text-sm text-ink-muted">No matching addresses. Choose one from the suggestions.</li>
        ) : (
          suggestions.map((row, index) => (
            <li key={row.placeId} role="presentation">
              <button
                id={`${listId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-[#F4F8FC] text-ink' : 'text-ink hover:bg-black/[0.03]'}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void choose(row);
                }}
              >
                <span className="font-semibold">{row.name}</span>
                {row.address ? <span className="text-xs text-ink-muted">{row.address}</span> : null}
              </button>
            </li>
          ))
        )}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className="space-y-3">
      {configured ? (
        <div className="relative">
          <label htmlFor={id} className="stay-field mb-1.5 block">
            <span>{label}</span>
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[#073b83]" aria-hidden />
            <input
              ref={inputRef}
              id={id}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-busy={loading || resolving}
              aria-activedescendant={open && suggestions[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined}
              value={shown}
              maxLength={240}
              placeholder="Search a street address"
              autoComplete="off"
              className="tv-input stay-address-input w-full"
              onChange={(event) => {
                resolveSeq.current += 1;
                setResolving(false);
                setDraft(event.target.value);
                setOpen(true);
                setError(null);
              }}
              onFocus={() => {
                setDraft(address);
                setOpen(true);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  if (rootRef.current?.contains(document.activeElement)) return;
                  setDraft(null);
                  setOpen(false);
                }, 120);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOpen(true);
                  setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter' && open && suggestions[activeIndex]) {
                  event.preventDefault();
                  void choose(suggestions[activeIndex]);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraft(null);
                  setOpen(false);
                }
              }}
            />
            {loading || resolving ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" aria-hidden />
            ) : null}
          </div>
          {error ? <p className="mt-1.5 text-xs text-red-700" role="alert">{error}</p> : null}
          {menu ? createPortal(menu, document.body) : null}
        </div>
      ) : (
        <label className="stay-field block" htmlFor={id}>
          <span>{label}</span>
          <textarea
            id={id}
            className="tv-input mt-1.5 w-full resize-y py-2 font-normal"
            rows={2}
            maxLength={240}
            value={address}
            placeholder="Street, number, and area — or a clear meeting point"
            onChange={(event) => onAddressText(event.target.value.slice(0, 240))}
          />
          <p className="stay-help mt-1.5 font-normal">Address search is unavailable. Your saved address stays as written.</p>
        </label>
      )}

      {hasPin ? (
        <>
          <RentalCollectionMap lat={lat} lng={lng} interactive onMove={onMovePin} label={`${label} map`} />
          <p className="stay-help">Drag the marker or tap the map to set the exact spot. The address above stays as selected.</p>
        </>
      ) : address.trim() ? (
        <p className="stay-help">This saved address has no map pin yet. Choose a suggestion to place one. The current text stays until you do.</p>
      ) : configured ? (
        <p className="stay-help">Search for the street address. The map appears after you choose a suggestion.</p>
      ) : null}
    </div>
  );
}
