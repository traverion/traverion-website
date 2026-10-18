import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STAY_AMENITY_GROUPS, formatStayAmenityLabel, stayAmenityDisplayList } from '../../../lib/stay-amenities';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
};

function hasAmenity(selected: string[], label: string): boolean {
  const key = formatStayAmenityLabel(label).toLowerCase();
  return stayAmenityDisplayList(selected).some((item) => item.toLowerCase() === key);
}

export default function StayAmenityPicker({ selected, onChange }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (document.getElementById(listId)?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, listId]);

  const canonical = stayAmenityDisplayList(selected);

  function toggle(label: string) {
    const clean = formatStayAmenityLabel(label);
    if (!clean) return;
    const current = stayAmenityDisplayList(selected);
    if (current.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      onChange(current.filter((item) => item.toLowerCase() !== clean.toLowerCase()));
      return;
    }
    onChange([...current, clean]);
  }

  const q = query.trim().toLowerCase();
  const menu =
    open && box ? (
      <div
        id={listId}
        role="listbox"
        aria-multiselectable="true"
        style={{ position: 'fixed', top: box.top, left: box.left, width: box.width }}
        className="z-[80] max-h-72 overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
      >
        <div className="sticky top-0 bg-white px-2 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="tv-input w-full"
            placeholder="Search amenities"
            aria-label="Search amenities"
            autoFocus
          />
        </div>
        {q && STAY_AMENITY_GROUPS.every((group) => group.items.filter((label) => label.toLowerCase().includes(q)).length === 0) ? (
          <p className="px-3 py-2 text-sm text-ink-muted">No amenities match.</p>
        ) : null}
        {STAY_AMENITY_GROUPS.map((group) => {
          const items = group.items.filter((label) => !q || label.toLowerCase().includes(q));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="px-1 pb-1">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{group.label}</p>
              {items.map((label) => {
                const on = hasAmenity(selected, label);
                return (
                  <button
                    key={`${group.label}-${label}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-disabled={on}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                      on ? 'bg-finland/10 font-semibold text-ink' : 'text-ink hover:bg-black/[0.03]'
                    }`}
                    onClick={() => {
                      if (!on) toggle(label);
                    }}
                  >
                    <span>{label}</span>
                    {on ? <span className="text-xs text-finland">Selected</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="space-y-3">
      <button
        ref={buttonRef}
        type="button"
        className="tv-btn-secondary !min-h-10 !px-4 text-sm"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        Add amenities
      </button>
      {canonical.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {canonical.map((item) => (
            <li key={item} className="inline-flex items-center gap-1 rounded-full bg-[#F4F7FB] py-1 pl-3 pr-1 text-sm text-ink ring-1 ring-[#D5DEEA]">
              <span>{item}</span>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-white hover:text-[#0B397E]"
                aria-label={`Remove ${item}`}
                onClick={() => toggle(item)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-muted">No amenities selected.</p>
      )}
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.slice(0, 40))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const next = custom.trim();
            if (!next || hasAmenity(selected, next)) {
              setCustom('');
              return;
            }
            toggle(next);
            setCustom('');
          }}
          className="tv-input w-full"
          placeholder="Custom amenity, then press Enter"
          maxLength={40}
          aria-label="Custom amenity"
        />
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
