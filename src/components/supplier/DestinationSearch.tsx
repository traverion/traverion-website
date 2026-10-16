import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
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
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!configured || !editing || query.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void autocompleteDestinations(query)
        .then((next) => {
          if (cancelled) return;
          setItems(next);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
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
  }, [configured, editing, query]);

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
      const place = await resolveDestination(suggestion.placeId);
      if (!place) {
        setSearchError('Choose a city or destination that includes a country. Nothing was changed.');
        return;
      }
      onSelect(place);
      setQuery('');
      setItems([]);
      setOpen(false);
      setEditing(false);
    } catch {
      setSearchError('That place could not be loaded. The saved destination was not changed.');
    } finally {
      setResolving(false);
    }
  };

  const label = selected?.formatted || savedLabel;

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-ink">
        City / destination *
      </label>
      {!editing && label ? (
        <div className="rounded-xl border border-black/10 bg-white px-3 py-3">
          <p className="text-sm font-bold text-ink">{label}</p>
          {selected ? (
            <p className="mt-0.5 text-[12px] text-ink-muted">Verified destination</p>
          ) : (
            <p className="mt-0.5 text-[12px] text-ink-muted">
              Saved from the earlier city list. Search to attach a map location.
            </p>
          )}
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-finland hover:underline"
            onClick={() => setEditing(true)}
          >
            {selected ? 'Change destination' : 'Search destination'}
          </button>
        </div>
      ) : configured ? (
        <>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              value={query}
              placeholder="Search a city, for example Rovaniemi"
              autoComplete="off"
              className="tv-input py-2.5 pl-10 text-[15px]"
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
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
                  if (label) setEditing(false);
                }
              }}
            />
          </div>
          {loading || resolving ? <p className="mt-1.5 text-xs text-ink-muted">Searching destinations…</p> : null}
          {searchError ? (
            <p className="mt-1.5 text-xs text-red-700" role="alert">
              {searchError}
            </p>
          ) : null}
          {open && items.length > 0 ? (
            <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg">
              {items.map((item, index) => (
                <li key={item.placeId} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left ${index === active ? 'bg-finland/10' : 'hover:bg-black/[0.03]'}`}
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
          {label ? (
            <button type="button" className="mt-2 text-sm font-semibold text-ink-muted hover:underline" onClick={() => setEditing(false)}>
              Keep {label}
            </button>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
          Location search needs VITE_GOOGLE_MAPS_API_KEY. The saved city and country stay as they are.
        </p>
      )}
    </div>
  );
}
