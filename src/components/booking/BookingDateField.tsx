import { useCallback, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { formatBookingDateDisplay } from '../../lib/booking-flow';

export type BookingDateFieldProps = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  className?: string;
  hint?: string;
};

function openNativeDatePicker(el: HTMLInputElement | null) {
  if (!el) return;
  if (typeof el.showPicker === 'function') {
    try {
      el.showPicker();
      return;
    } catch {
      /* Safari / unsupported */
    }
  }
  el.focus();
  el.click();
}

export default function BookingDateField({
  id,
  label = 'Date',
  value,
  onChange,
  min,
  className = '',
  hint,
}: BookingDateFieldProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const displayLabel = value.trim() ? formatBookingDateDisplay(value) : '';

  const openPicker = useCallback(() => {
    openNativeDatePicker(internalRef.current);
  }, []);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium tracking-tight text-gray-700">
        {label}
      </label>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 ease-smooth hover:border-finland/35 hover:shadow-md focus-within:border-finland focus-within:shadow-md focus-within:ring-2 focus-within:ring-finland/15"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        role="presentation"
      >
        <Calendar
          className="pointer-events-none absolute right-3.5 top-1/2 z-[2] h-5 w-5 -translate-y-1/2 text-finland/70 transition-colors duration-200 group-hover:text-finland group-focus-within:text-finland"
          aria-hidden
        />
        {!value.trim() && (
          <span
            className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-sm text-gray-400 select-none"
            aria-hidden
          >
            Select a date
          </span>
        )}
        <input
          id={id}
          ref={internalRef}
          type="date"
          value={value}
          min={min ?? new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            e.stopPropagation();
            openNativeDatePicker(e.currentTarget);
          }}
          className={`relative z-[0] w-full cursor-pointer rounded-xl border-0 bg-transparent py-3 pl-4 pr-12 text-sm font-medium text-gray-900 transition-opacity duration-150 focus:outline-none focus:ring-0 ${
            value.trim() ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label={label}
        />
      </div>
      {displayLabel ? (
        <p className="mt-1.5 text-xs font-medium text-finland/90 animate-fade-in motion-reduce:animate-none">
          {displayLabel}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
