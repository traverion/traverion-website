import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, X } from 'lucide-react';
import type { VerifiedDestination } from '../../lib/destination-place';
import { autocompleteDestinations, placesSearchConfigured, resolveDestination } from '../../lib/places-client';
import type { PlaceSuggestion } from '../../lib/places-client';

type Props = {
  id: string;
  selected: VerifiedDestination | null;
  /** Shown when a verified place is already saved. Free text is not treated as a selection. */
  savedLabel: string;
  onSelect: (place: VerifiedDestination) => void;
  onClear?: () => void;
  label?: string;
  placeholder?: string;
  /** Shown when a draft has city and country but no verified place yet. */
  legacyHint?: string;
};

type MenuBox = { top: number; left: number; width: number; openUp: boolean };

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Shared destination search for every product creator.
 * Uses the existing Google Places destination API. A place counts only after a suggestion is chosen.
 */
export default function TraverionLocationSelector({
  id,
  selected,
  savedLabel,
  onSelect,
  onClear,
  label = 'Location *',
  placeholder = 'Search for a city, destination or place...',
  legacyHint,
}: Props) {
  const listId = useId();
  const labelText = selected?.formatted || savedLabel;
  const [draft, setDraft] = useState(labelText);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<MenuBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const resolvingRef = useRef(false);

  useEffect(() => {
    if (!open) setDraft(labelText);
  }, [labelText, open]);

  useEffect(() => {
    resolvingRef.current = resolving;
  }, [resolving]);

  useEffect(() => {
    if (!open || !placesSearchConfigured()) {
      setSuggestions([]);
      setLoading(false);
      setEmpty(false);
      return;
    }
    const query = draft.trim();
    if (query.length < 2 || query === labelText.trim()) {
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
      void autocompleteDestinations(query, abort.signal)
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
          setError(err instanceof Error ? err.message : 'Location search is unavailable.');
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [draft, open, labelText]);

  useEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    function place() {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 220 && rect.top > spaceBelow;
      setMenuBox({ top: openUp ? rect.top - 4 : rect.bottom + 4, left: rect.left, width: rect.width, openUp });
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
    return () => resolveAbortRef.current?.abort();
  }, []);

  function closeToSaved() {
    setOpen(false);
    setDraft(labelText);
    setSuggestions([]);
    setEmpty(false);
    setError(null);
  }

  async function choose(suggestion: PlaceSuggestion) {
    resolveAbortRef.current?.abort();
    const abort = new AbortController();
    resolveAbortRef.current = abort;
    setResolving(true);
    setError(null);
    try {
      const place = await resolveDestination(suggestion.placeId, abort.signal);
      if (abort.signal.aborted) return;
      if (!place) {
        setError('That place has no country or map location. Choose another result.');
        return;
      }
      const verified: VerifiedDestination = {
        placeId: place.placeId,
        city: place.city,
        country: place.country,
        countryCode: place.countryCode,
        formatted: place.formatted,
        lat: place.lat,
        lng: place.lng,
      };
      onSelect(verified);
      setDraft(verified.formatted);
      setOpen(false);
      setSuggestions([]);
      setEmpty(false);
    } catch (err) {
      if (abort.signal.aborted || isAbortError(err)) return;
      setError(err instanceof Error ? err.message : 'That place could not be loaded.');
    } finally {
      if (!abort.signal.aborted) setResolving(false);
    }
  }

  const shown = open ? draft : labelText;
  const configured = placesSearchConfigured();
  const queryActive = open && draft.trim() !== labelText.trim();
  const showClear = Boolean(onClear && labelText && !queryActive && !loading && !resolving);

  const menu =
    open && menuBox && (suggestions.length > 0 || empty) ? (
      <ul
        id={listId}
        role="listbox"
        style={{
          position: 'fixed',
          top: menuBox.top,
          left: menuBox.left,
          width: menuBox.width,
          transform: menuBox.openUp ? 'translateY(-100%)' : undefined,
        }}
        className="z-[80] max-h-64 overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
      >
        {empty ? (
          <li className="px-3 py-2 text-sm text-ink-muted">No matching places. Try a city or destination name.</li>
        ) : (
          suggestions.map((row, index) => (
            <li key={row.placeId} role="presentation">
              <button
                id={`${listId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm ${
                  index === activeIndex ? 'bg-finland/10 text-ink' : 'text-ink hover:bg-black/[0.03]'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(e) => {
                  e.preventDefault();
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
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-busy={loading || resolving}
          aria-activedescendant={
            open && suggestions[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
          }
          value={shown}
          disabled={!configured}
          placeholder={configured ? placeholder : 'Location search is unavailable'}
          autoComplete="off"
          className="tv-input pl-9 pr-10"
          onChange={(e) => {
            resolveAbortRef.current?.abort();
            setResolving(false);
            const next = e.target.value;
            const saved = labelText.trim();
            const appended = saved.length > 0 && next.startsWith(saved) && next.length === saved.length + 1;
            setDraft(appended ? next.slice(saved.length) : next);
            setOpen(true);
            setError(null);
          }}
          onFocus={(e) => {
            setOpen(true);
            const input = e.currentTarget;
            if (input.value.trim()) requestAnimationFrame(() => input.select());
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (resolvingRef.current) return;
              if (rootRef.current?.contains(document.activeElement)) return;
              closeToSaved();
            }, 120);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              if (open && suggestions[activeIndex]) {
                e.preventDefault();
                void choose(suggestions[activeIndex]);
              } else if (open) {
                e.preventDefault();
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeToSaved();
            }
          }}
        />
        {loading || resolving ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" aria-hidden />
        ) : showClear ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-black/[0.04] hover:text-ink"
            aria-label="Clear location"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear?.();
              setDraft('');
              setOpen(true);
              setSuggestions([]);
              setEmpty(false);
              setError(null);
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : queryActive && draft.trim() ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-black/[0.04] hover:text-ink"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              resolveAbortRef.current?.abort();
              setResolving(false);
              setDraft('');
              setSuggestions([]);
              setEmpty(false);
              setError(null);
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {legacyHint && !selected ? <p className="mt-1.5 text-xs text-ink-muted">{legacyHint}</p> : null}
      {!configured ? (
        <p className="mt-1.5 text-xs text-red-700" role="alert">
          Location search is unavailable right now.
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
