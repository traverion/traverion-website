import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin } from 'lucide-react';
import { computeAnchoredActionMenuBox } from '../../../lib/anchored-popover';
import { autocompleteAddresses, placesSearchConfigured, resolveAddress, type PlaceSuggestion } from '../../../lib/places-client';

export type SelectedStayAddress = {
  placeId: string;
  street: string;
  unit: string;
  postal: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
};

type Props = {
  id: string;
  bias: { lat: number; lng: number } | null;
  selectedLabel: string;
  onSelect: (address: SelectedStayAddress) => void;
  onUnresolved: (message: string) => void;
};

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export default function StayAddressSearch({ id, bias, selectedLabel, onSelect, onUnresolved }: Props) {
  const listId = useId();
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
  const configured = placesSearchConfigured();

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

  const shown = draft ?? selectedLabel;

  async function choose(suggestion: PlaceSuggestion) {
    const seq = resolveSeq.current + 1;
    resolveSeq.current = seq;
    setResolving(true);
    setError(null);
    try {
      const place = await resolveAddress(suggestion.placeId);
      if (resolveSeq.current !== seq) return;
      if (!place) {
        const message = 'That address has no map location. Choose another suggestion.';
        setError(message);
        onUnresolved(message);
        return;
      }
      if (!place.street) {
        const message = 'Choose a street address, including the building number.';
        setError(message);
        onUnresolved(message);
        return;
      }
      onSelect({
        placeId: place.placeId,
        street: place.street,
        unit: place.unit,
        postal: place.postal,
        city: place.city,
        country: place.country,
        countryCode: place.countryCode,
        lat: place.lat,
        lng: place.lng,
      });
      setDraft(null);
      setOpen(false);
      setSuggestions([]);
      setEmpty(false);
    } catch (err) {
      if (resolveSeq.current !== seq) return;
      const message = err instanceof Error ? err.message : 'That address could not be loaded.';
      setError(message);
      onUnresolved(message);
    } finally {
      if (resolveSeq.current === seq) setResolving(false);
    }
  }

  const menu =
    open && menuBox && (suggestions.length > 0 || empty) ? (
      <ul
        id={listId}
        role="listbox"
        style={{ position: 'fixed', top: menuBox.top, left: menuBox.left, width: menuBox.width }}
        className="z-[90] max-h-64 overflow-auto rounded-xl border border-[#E6EAF0] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
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
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="stay-field mb-1.5 block">
        <span>Property address</span>
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
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
          disabled={!configured && !selectedLabel}
          placeholder={configured ? 'Siljotie 2, Rovaniemi' : 'Address search is unavailable'}
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
            setDraft(selectedLabel);
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
            } else if (event.key === 'Enter') {
              if (open && suggestions[activeIndex]) {
                event.preventDefault();
                void choose(suggestions[activeIndex]);
              }
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        {loading || resolving ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" aria-hidden />
        ) : null}
      </div>
      {!configured ? (
        <p className="mt-1.5 text-xs text-ink-muted">Address search is unavailable. A previously saved address can still be used.</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-red-700" role="alert">{error}</p> : null}
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
