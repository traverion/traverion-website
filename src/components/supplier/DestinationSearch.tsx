import { useEffect, useId, useRef, useState } from 'react';
import {
  autocompleteDestinations,
  placesSearchConfigured,
  resolveDestination,
  type PlaceSuggestion,
} from '../../lib/places-client';
import type { VerifiedDestination } from '../../lib/destination-place';

type Props = {
  id: string;
  selected: VerifiedDestination | null;
  savedLabel: string;
  onSelect: (place: VerifiedDestination) => void;
};

export default function DestinationSearch({ id, selected, savedLabel, onSelect }: Props) {
  const configured = placesSearchConfigured();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const address = selected?.formatted || savedLabel;
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const query = draft ?? address;

  useEffect(() => {
    if (!configured || draft == null || draft.trim().length < 2 || draft.trim() === address) {
      setItems([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void autocompleteDestinations(draft)
        .then((next) => {
          if (cancelled) return;
          setItems(next);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setOpen(false);
          setSearchError('Location search is unavailable. The saved destination was not changed.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, configured, draft]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = async (suggestion: PlaceSuggestion) => {
    setLoading(true);
    setSearchError(null);
    try {
      const place = await resolveDestination(suggestion.placeId);
      if (!place) {
        setSearchError('Choose a city or destination that includes a country. Nothing was changed.');
        return;
      }
      onSelect(place);
      setDraft(null);
      setItems([]);
      setOpen(false);
    } catch {
      setSearchError('That place could not be loaded. The saved destination was not changed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-ink">
        City / destination *
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder="Rovaniemi, Finland"
        autoComplete="off"
        className="tv-input w-full py-2.5 text-[15px]"
        onChange={(event) => {
          setDraft(event.target.value);
          setSearchError(null);
        }}
        onBlur={() => {
          window.setTimeout(() => setDraft(null), 150);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(items.length - 1, index + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === 'Enter' && open && items[active]) {
            event.preventDefault();
            void choose(items[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setDraft(null);
          }
        }}
      />
      {loading ? <p className="mt-1.5 text-xs text-ink-muted">Searching destinations…</p> : null}
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
            <li key={item.placeId} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`block w-full px-3 py-2.5 text-left text-sm text-ink ${
                  index === active ? 'bg-finland/10' : 'hover:bg-black/[0.03]'
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => void choose(item)}
              >
                {item.address ? `${item.name}, ${item.address}` : item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
