import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type PartnerSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

type PartnerSelectProps = {
  id?: string;
  value: string;
  options: readonly PartnerSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Show a filter field when there are many options (default: auto when > 8). */
  searchable?: boolean | 'auto';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
};

/**
 * Traverion-themed select — paper trigger + ink menu (not native OS chrome).
 */
export default function PartnerSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select…',
  className = '',
  searchable = 'auto',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
}: PartnerSelectProps) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const searchId = `${autoId}-search`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value) ?? null;
  const display = selected?.label ?? placeholder;
  const showSearch =
    searchable === true || (searchable === 'auto' && options.length > 8);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const idx = Math.max(
      0,
      filtered.findIndex((o) => o.value === value)
    );
    setActiveIndex(idx < 0 ? 0 : idx);
    if (showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, filtered, value, showSearch]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
    buttonRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) choose(opt.value);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`partner-select relative ${className}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        className={`partner-select__trigger tv-input flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-[13.5px] text-left transition-[box-shadow,border-color,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? 'partner-select__trigger--open' : ''
        } ${!selected ? 'text-ink-muted' : 'text-ink'}`}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate" title={selected ? display : undefined}>
          {display}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="partner-select__menu absolute left-0 right-0 z-40 mt-1.5 overflow-hidden outline-none">
          {showSearch ? (
            <div className="flex items-center gap-2 border-b border-[#eef0f3] px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onListKeyDown}
                placeholder="Search listings…"
                aria-label="Search listings"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          ) : null}
          <ul
            id={listboxId}
            role="listbox"
            tabIndex={showSearch ? -1 : 0}
            aria-activedescendant={
              filtered[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined
            }
            className="max-h-64 overflow-auto py-1 outline-none"
            onKeyDown={onListKeyDown}
            ref={(el) => {
              if (!showSearch) el?.focus();
            }}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-ink-muted">No matches</li>
            ) : (
              filtered.map((opt, index) => {
                const isSelected = opt.value === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={opt.value || `empty-${index}`}
                    id={`${listboxId}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`partner-select__option flex cursor-pointer items-start gap-2 px-3 py-2.5 ${
                      isActive ? 'partner-select__option--active' : ''
                    } ${isSelected ? 'partner-select__option--selected' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(opt.value)}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-finland" strokeWidth={2.5} aria-hidden />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug text-ink" title={opt.label}>
                        {opt.label}
                      </span>
                      {opt.hint ? (
                        <span
                          className="mt-0.5 block truncate text-xs leading-snug text-ink-muted"
                          title={opt.hint}
                        >
                          {opt.hint}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
