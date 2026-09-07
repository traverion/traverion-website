import { Minus, Plus } from 'lucide-react';
import { formatPartySizeHint, guestCountBoundaryMessage } from '../../lib/booking-flow';

export type GuestStepperProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onBoundaryAttempt?: (message: string) => void;
  label?: string;
  id?: string;
  className?: string;
};

export default function GuestStepper({
  value,
  min,
  max,
  onChange,
  onBoundaryAttempt,
  label = 'Guests',
  id,
  className = '',
}: GuestStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  const tryDecrease = () => {
    if (atMin) {
      onBoundaryAttempt?.(guestCountBoundaryMessage('min', { min, max }));
      return;
    }
    onChange(Math.max(min, value - 1));
  };

  const tryIncrease = () => {
    if (atMax) {
      onBoundaryAttempt?.(guestCountBoundaryMessage('max', { min, max }));
      return;
    }
    onChange(Math.min(max, value + 1));
  };

  return (
    <div className={className}>
      <span id={id} className="mb-1.5 block text-sm font-medium tracking-tight text-gray-700">
        {label}
      </span>
      <div
        className="flex overflow-hidden rounded-xl bg-paper-raised shadow-[0_0_0_1px_rgba(28,25,23,0.08)] transition-[box-shadow] duration-150 focus-within:shadow-[0_0_0_2px_rgba(0,53,128,0.35)]"
        role="group"
        aria-labelledby={id}
      >
        <button
          type="button"
          className="lux-flat flex h-12 w-12 shrink-0 items-center justify-center text-finland transition-colors duration-150 hover:bg-finland/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100"
          aria-label="Decrease number of guests"
          disabled={atMin}
          onClick={tryDecrease}
        >
          <Minus className="h-4 w-4 stroke-[2.5]" aria-hidden />
        </button>
        <div
          className="flex min-w-0 flex-1 items-center justify-center border-x border-black/[0.06] px-3"
          aria-live="polite"
          aria-atomic="true"
        >
          <span key={value} className="tv-tick text-sm font-semibold tabular-nums tracking-tight text-ink">
            {value} {value === 1 ? 'guest' : 'guests'}
          </span>
        </div>
        <button
          type="button"
          className="lux-flat flex h-12 w-12 shrink-0 items-center justify-center text-finland transition-colors duration-150 hover:bg-finland/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100"
          aria-label="Increase number of guests"
          disabled={atMax}
          onClick={tryIncrease}
        >
          <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">{formatPartySizeHint({ min, max })}</p>
    </div>
  );
}
