import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * Menu portals to document.body with fixed positioning so it is not clipped by modals.
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
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );

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

  const placeMenu = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    const isNarrow = window.matchMedia('(max-width: 639px)').matches;
    // Match the trigger width so menus align with their fields (Offers / Analytics).
    const width = Math.min(Math.max(rect.width, isNarrow ? rect.width : rect.width), window.innerWidth - edge * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - edge) {
      left = Math.max(edge, window.innerWidth - width - edge);
    }
    if (left < edge) left = edge;
    const searchHeight = showSearch ? 44 : 0;
    const listCap = isNarrow ? Math.min(280, window.innerHeight * 0.45) : 240;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - edge);
    const spaceAbove = Math.max(0, rect.top - gap - edge);
    const needed = listCap + searchHeight;
    // Prefer opening downward; flip up only when below space is genuinely insufficient.
    const openUp = spaceBelow < Math.min(needed, 120) && spaceAbove > spaceBelow + 48;
    const room = openUp ? spaceAbove : Math.max(spaceBelow, 96);
    const maxHeight = Math.max(72, Math.min(listCap, room - searchHeight));
    const top = openUp
      ? Math.max(edge, rect.top - gap - maxHeight - searchHeight)
      : rect.bottom + gap;
    setMenuBox({ top, left, width, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    placeMenu();
    const onWin = () => placeMenu();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, filtered.length]);

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
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const menu =
    open && menuBox && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="partner-select__menu overflow-hidden outline-none"
            style={{
              position: 'fixed',
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              maxWidth: 'min(100vw - 1rem, 28rem)',
              zIndex: 120,
            }}
          >
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
                  placeholder="Search…"
                  aria-label="Search options"
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
              className="overflow-auto py-1 outline-none"
              style={{ maxHeight: menuBox.maxHeight }}
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
          </div>,
          document.body
        )
      : null;

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
      {menu}
    </div>
  );
}
