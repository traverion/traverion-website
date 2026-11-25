import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeAnchoredActionMenuBox } from '../../lib/anchored-popover';
import {
  businessAddressSuggestionText,
  businessCountryName,
  businessCountryOptions,
  structuredBusinessAddress,
  type StructuredBusinessAddress,
} from '../../lib/business-address';
import { autocompleteAddresses, placesSearchConfigured, resolveAddress, type PlaceSuggestion } from '../../lib/places-client';
import PartnerSelect from './PartnerSelect';

type Props = {
  value: StructuredBusinessAddress;
  onChange: (next: StructuredBusinessAddress) => void;
  errors?: Record<string, string>;
};

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export default function RegisteredBusinessAddress({ value, onChange, errors = {} }: Props) {
  const listId = useId();
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolveSeq = useRef(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const configured = placesSearchConfigured();
  const countryOptions = useMemo(() => businessCountryOptions(value.country), [value.country]);
  const countryValue = businessCountryName(value.country);
  const [manual, setManual] = useState(false);
  const saved = Boolean(value.street.trim() || value.postal.trim() || value.city.trim());
  const showDetails = saved || manual;

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
      void autocompleteAddresses(query, { signal: abort.signal })
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
          setError('Address search is unavailable.');
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [configured, draft, open]);

  function edit(patch: Partial<StructuredBusinessAddress>) {
    resolveSeq.current += 1;
    setResolving(false);
    onChange({ ...value, ...patch });
  }

  async function choose(suggestion: PlaceSuggestion) {
    const seq = resolveSeq.current + 1;
    resolveSeq.current = seq;
    setResolving(true);
    setError(null);
    try {
      const place = await resolveAddress(suggestion.placeId);
      if (resolveSeq.current !== seq) return;
      if (!place) {
        setManual(true);
        setError('That address could not be read. Enter the street, postal code, city, and country.');
        return;
      }
      const next = structuredBusinessAddress(place);
      if (resolveSeq.current !== seq) return;
      const unit = place.unit.trim();
      const street = unit && !next.street.toLowerCase().includes(unit.toLowerCase())
        ? [next.street, unit].filter(Boolean).join(', ')
        : next.street;
      onChange({
        street,
        postal: next.postal,
        city: next.city,
        country: businessCountryName(next.country) || next.country,
      });
      setDraft('');
      setOpen(false);
      setSuggestions([]);
      setEmpty(false);
    } catch {
      if (resolveSeq.current !== seq) return;
      setManual(true);
      setError('That address could not be read. Enter the street, postal code, city, and country.');
    } finally {
      if (resolveSeq.current === seq) setResolving(false);
    }
  }

  const menu =
    open && menuBox && (loading || suggestions.length > 0 || empty) ? (
      <ul
        id={listId}
        role="listbox"
        style={{ position: 'fixed', top: menuBox.top, left: menuBox.left, width: menuBox.width }}
        className="supplier-onboarding-suggest"
      >
        {loading && suggestions.length === 0 ? (
          <li className="supplier-onboarding-suggest__status">Searching…</li>
        ) : empty ? (
          <li className="supplier-onboarding-suggest__status">No matching addresses.</li>
        ) : (
          suggestions.map((row, index) => (
            <li key={row.placeId} role="presentation">
              <button
                id={`${listId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'is-active' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void choose(row);
                }}
              >
                {businessAddressSuggestionText(row)}
              </button>
            </li>
          ))
        )}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className="supplier-onboarding-grid__wide supplier-onboarding-address">
      <div className="supplier-onboarding-field" data-field="address-search">
        <div className="supplier-onboarding-field__label">
          <label htmlFor={inputId}>Search address</label>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open && (suggestions.length > 0 || empty || loading)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-busy={loading || resolving}
          aria-activedescendant={open && suggestions[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined}
          className="tv-input"
          value={draft ?? ''}
          autoComplete="off"
          placeholder="Search for your business address"
          onChange={(event) => {
            resolveSeq.current += 1;
            setResolving(false);
            setDraft(event.target.value);
            setOpen(true);
            setError(null);
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
              setOpen(false);
            }
          }}
        />
        {error ? (
          <p className="supplier-onboarding-error" role="alert">
            {error}
          </p>
        ) : null}
        {showDetails ? null : (
          <button type="button" className="supplier-onboarding-address__manual" onClick={() => setManual(true)}>
            Enter address manually
          </button>
        )}
      </div>
      <div
        className={`supplier-onboarding-address__details${showDetails ? ' supplier-onboarding-address__details--open' : ''}`}
        inert={showDetails ? undefined : true}
        aria-hidden={showDetails ? undefined : true}
      >
      <div className="supplier-onboarding-grid">
        <div className={`supplier-onboarding-field supplier-onboarding-grid__wide${errors['address-street'] ? ' supplier-onboarding-field--invalid' : ''}`} data-field="address-street">
          <div className="supplier-onboarding-field__label">
            <label htmlFor={`${inputId}-street`}>Street address</label>
          </div>
          <input
            id={`${inputId}-street`}
            className="tv-input"
            value={value.street}
            autoComplete="street-address"
            placeholder="Street, apartment, suite, or unit"
            aria-invalid={Boolean(errors['address-street']) || undefined}
            onChange={(event) => edit({ street: event.target.value })}
          />
          {errors['address-street'] ? <p className="supplier-onboarding-field__error">{errors['address-street']}</p> : null}
        </div>
        <div className={`supplier-onboarding-field${errors['address-postal'] ? ' supplier-onboarding-field--invalid' : ''}`} data-field="address-postal">
          <div className="supplier-onboarding-field__label">
            <label htmlFor={`${inputId}-postal`}>Postal code</label>
          </div>
          <input
            id={`${inputId}-postal`}
            className="tv-input"
            value={value.postal}
            autoComplete="postal-code"
            aria-invalid={Boolean(errors['address-postal']) || undefined}
            onChange={(event) => edit({ postal: event.target.value })}
          />
          {errors['address-postal'] ? <p className="supplier-onboarding-field__error">{errors['address-postal']}</p> : null}
        </div>
        <div className={`supplier-onboarding-field${errors['address-city'] ? ' supplier-onboarding-field--invalid' : ''}`} data-field="address-city">
          <div className="supplier-onboarding-field__label">
            <label htmlFor={`${inputId}-city`}>City</label>
          </div>
          <input
            id={`${inputId}-city`}
            className="tv-input"
            value={value.city}
            autoComplete="address-level2"
            aria-invalid={Boolean(errors['address-city']) || undefined}
            onChange={(event) => edit({ city: event.target.value })}
          />
          {errors['address-city'] ? <p className="supplier-onboarding-field__error">{errors['address-city']}</p> : null}
        </div>
        <div className={`supplier-onboarding-field${errors['address-country'] ? ' supplier-onboarding-field--invalid' : ''}`} data-field="address-country">
          <div className="supplier-onboarding-field__label">
            <label htmlFor={`${inputId}-country`}>Country</label>
          </div>
          <PartnerSelect
            id={`${inputId}-country`}
            value={countryValue}
            options={countryOptions}
            searchable
            placeholder="Select a country"
            aria-label="Country"
            aria-invalid={Boolean(errors['address-country']) || undefined}
            onChange={(next) => edit({ country: next })}
          />
          {errors['address-country'] ? <p className="supplier-onboarding-field__error">{errors['address-country']}</p> : null}
        </div>
      </div>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
