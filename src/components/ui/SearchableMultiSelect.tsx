import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export type SearchableMultiSelectOption = {
  id: string;
  label: string;
  group?: string;
};

type Props = {
  id?: string;
  label: string;
  hint?: string;
  values: string[];
  options: readonly SearchableMultiSelectOption[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptySearchText?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
};

export function SearchableMultiSelect({
  id,
  label,
  hint,
  values,
  options,
  onChange,
  placeholder = 'Search and select…',
  emptySearchText = 'No matches',
  disabled = false,
  'aria-invalid': ariaInvalid,
}: Props) {
  const autoId = useId();
  const rootId = id ?? autoId;
  const listboxId = `${rootId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const labelById = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...options];
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchableMultiSelectOption[]>();
    for (const opt of filtered) {
      const g = opt.group?.trim() || 'Other';
      const list = map.get(g) ?? [];
      list.push(opt);
      map.set(g, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const flatFiltered = filtered;

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const toggle = (optId: string) => {
    if (selectedSet.has(optId)) onChange(values.filter((v) => v !== optId));
    else onChange([...values, optId]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flatFiltered.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = flatFiltered[activeIndex];
      if (opt) toggle(opt.id);
    }
  };

  return (
    <div ref={rootRef} className="min-w-0" onKeyDown={onKeyDown}>
      <label htmlFor={`${rootId}-trigger`} className="mb-1 block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {hint ? <p className="mb-1.5 text-[12px] leading-relaxed text-ink-muted">{hint}</p> : null}
      <button
        id={`${rootId}-trigger`}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={ariaInvalid || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="tv-input flex w-full min-h-11 items-center justify-between gap-2 text-left"
      >
        <span className={`min-w-0 truncate text-[14px] ${values.length ? 'text-ink' : 'text-ink-muted'}`}>
          {values.length ? `${values.length} selected` : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {values.map((id) => (
            <li
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-finland/10 px-2 py-1 text-[12px] font-medium text-finland"
            >
              <span className="min-w-0 truncate">{labelById.get(id) ?? id}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-finland/15"
                aria-label={`Remove ${labelById.get(id) ?? id}`}
                onClick={() => onChange(values.filter((v) => v !== id))}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div
          className="relative z-30 mt-1.5 overflow-hidden rounded-[var(--partner-radius,0.5rem)] border border-black/[0.08] bg-paper shadow-lg"
          role="presentation"
        >
          <div className="flex items-center gap-2 border-b border-black/[0.06] px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
              aria-autocomplete="list"
              aria-controls={listboxId}
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            className="max-h-56 overflow-y-auto overscroll-contain py-1"
          >
            {flatFiltered.length === 0 ? (
              <li className="px-3 py-2.5 text-[13px] text-ink-muted">{emptySearchText}</li>
            ) : (
              grouped.map(([group, opts]) => (
                <li key={group} role="presentation">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                    {group}
                  </p>
                  <ul role="group" aria-label={group}>
                    {opts.map((opt) => {
                      const flatIdx = flatFiltered.findIndex((o) => o.id === opt.id);
                      const selected = selectedSet.has(opt.id);
                      const active = flatIdx === activeIndex;
                      return (
                        <li key={opt.id} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] ${
                              active ? 'bg-finland/10' : 'hover:bg-black/[0.03]'
                            }`}
                            onMouseEnter={() => setActiveIndex(flatIdx)}
                            onClick={() => toggle(opt.id)}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? 'border-finland bg-finland text-white'
                                  : 'border-black/15 bg-paper'
                              }`}
                              aria-hidden
                            >
                              {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                            </span>
                            <span className="min-w-0 break-words text-ink">{opt.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
