import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (hm: string) => void;
  disabled?: boolean;
  /** Optional HH:MM suggestions shown above the columns. */
  suggestions?: string[];
  className?: string;
  'aria-label'?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parseHm(value: string): { h: string; m: string } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h: String(h).padStart(2, '0'), m: String(m).padStart(2, '0') };
}

function normalizeTyped(raw: string): string | null {
  const cleaned = raw.trim().replace('.', ':').replace(/[^\d:]/g, '');
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) return parseHm(cleaned) ? `${parseHm(cleaned)!.h}:${parseHm(cleaned)!.m}` : null;
  if (/^\d{3,4}$/.test(cleaned)) {
    const padded = cleaned.padStart(4, '0');
    return parseHm(`${padded.slice(0, 2)}:${padded.slice(2)}`)
      ? `${padded.slice(0, 2)}:${padded.slice(2)}`
      : null;
  }
  return null;
}

/**
 * Traverion 24h time selector — custom columns + typed entry (not native browser picker).
 */
export default function PartnerTimeSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  suggestions = [],
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const autoId = useId();
  const fieldId = id || autoId;
  const parsed = parseHm(value);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(value || '');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTyped(value || '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !parsed) return;
    const scrollSelected = (el: HTMLDivElement | null, sel: string) => {
      const node = el?.querySelector(`[data-value="${sel}"]`) as HTMLElement | null;
      node?.scrollIntoView({ block: 'center' });
    };
    requestAnimationFrame(() => {
      scrollSelected(hourRef.current, parsed.h);
      scrollSelected(minuteRef.current, parsed.m);
    });
  }, [open, parsed?.h, parsed?.m]);

  const suggestionList = useMemo(
    () => [...new Set(suggestions.map((s) => parseHm(s)).filter(Boolean).map((p) => `${p!.h}:${p!.m}`))],
    [suggestions]
  );

  const commit = (hm: string) => {
    onChange(hm);
    setTyped(hm);
    setOpen(false);
  };

  const applyTyped = () => {
    const next = normalizeTyped(typed);
    if (next) commit(next);
    else setTyped(value || '');
  };

  return (
    <div ref={rootRef} className={`tv-time-select ${className}`.trim()}>
      {label ? (
        <label htmlFor={fieldId} className="mb-1.5 block text-[12px] font-semibold text-[#52525b]">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        aria-label={ariaLabel || label || 'Time'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="tv-time-select__trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="tv-time-select__value tabular-nums">
          {parsed ? (
            <>
              <span>{parsed.h}</span>
              <span className="tv-time-select__colon" aria-hidden>
                :
              </span>
              <span>{parsed.m}</span>
            </>
          ) : (
            <span className="text-[#a1a1aa]">–– : ––</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#71717a]" aria-hidden />
      </button>

      {open ? (
        <div className="tv-time-select__panel" role="dialog" aria-label="Choose time">
          {suggestionList.length > 0 ? (
            <div className="tv-time-select__suggestions">
              {suggestionList.map((hm) => (
                <button key={hm} type="button" className="tv-time-select__chip" onClick={() => commit(hm)}>
                  {hm}
                </button>
              ))}
            </div>
          ) : null}
          <div className="tv-time-select__columns">
            <div ref={hourRef} className="tv-time-select__col" role="listbox" aria-label="Hour">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="option"
                  data-value={h}
                  aria-selected={parsed?.h === h}
                  className={`tv-time-select__option ${parsed?.h === h ? 'is-selected' : ''}`}
                  onClick={() => commit(`${h}:${parsed?.m ?? '00'}`)}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="tv-time-select__divider" aria-hidden>
              :
            </div>
            <div ref={minuteRef} className="tv-time-select__col" role="listbox" aria-label="Minute">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  data-value={m}
                  aria-selected={parsed?.m === m}
                  className={`tv-time-select__option ${parsed?.m === m ? 'is-selected' : ''}`}
                  onClick={() => commit(`${parsed?.h ?? '00'}:${m}`)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="tv-time-select__manual">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              className="tv-input h-9 w-full text-sm tabular-nums"
              value={typed}
              placeholder="18:00"
              aria-label="Type time"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyTyped();
                }
              }}
              onBlur={applyTyped}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
