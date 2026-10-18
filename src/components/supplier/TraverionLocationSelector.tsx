import { useEffect, useId, useRef, useState } from 'react';
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
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) setDraft(labelText);
  }, [labelText, open]);

  useEffect(() => {
    if (!open || !placesSearchConfigured()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const query = draft.trim();
    if (query.length < 2 || query === labelText) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void autocompleteDestinations(query, abort.signal)
        .then((rows) => {
          if (abort.signal.aborted) return;
          setSuggestions(rows);
          setActiveIndex(0);
          setError(rows.length === 0 ? 'No matching places. Try a city or destination name.' : null);
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted || isAbortError(err)) return;
          setSuggestions([]);
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
    return () => resolveAbortRef.current?.abort();
  }, []);

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
    } catch (err) {
      if (abort.signal.aborted || isAbortError(err)) return;
      setError(err instanceof Error ? err.message : 'That place could not be loaded.');
    } finally {
      if (!abort.signal.aborted) setResolving(false);
    }
  }

  const shown = open ? draft : labelText;
  const configured = placesSearchConfigured();

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && suggestions[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
          }
          value={shown}
          disabled={!configured || resolving}
          placeholder={configured ? placeholder : 'Location search is unavailable'}
          autoComplete="off"
          className="tv-input pl-9 pr-10"
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setError(null);
          }}
          onFocus={() => {
            setDraft(labelText);
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                setOpen(false);
                setDraft(labelText);
                setSuggestions([]);
              }
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && suggestions[activeIndex]) {
              e.preventDefault();
              void choose(suggestions[activeIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setDraft(labelText);
            }
          }}
        />
        {loading || resolving ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" aria-hidden />
        ) : labelText && onClear ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-black/[0.04] hover:text-ink"
            aria-label="Clear location"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setDraft('');
              setOpen(false);
              setSuggestions([]);
              setError(null);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {selected ? (
        <p className="mt-1.5 text-xs text-ink-muted">Selected: {selected.formatted}</p>
      ) : legacyHint ? (
        <p className="mt-1.5 text-xs text-ink-muted">{legacyHint}</p>
      ) : null}
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
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
        >
          {suggestions.map((row, index) => (
            <li key={row.placeId} role="presentation">
              <button
                id={`${listId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm ${
                  index === activeIndex ? 'bg-finland/10 text-ink' : 'text-ink hover:bg-black/[0.03]'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void choose(row)}
              >
                <span className="font-semibold">{row.name}</span>
                {row.address ? <span className="text-xs text-ink-muted">{row.address}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
