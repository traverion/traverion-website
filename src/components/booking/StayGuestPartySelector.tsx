import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  stayGuestAgeCopy,
  validateStayGuestParty,
  type StayGuestParty,
  type StayGuestPolicy,
} from '../../lib/stay-guest-party';

type Props = {
  id: string;
  party: StayGuestParty;
  policy: StayGuestPolicy;
  maxGuests: number | null;
  onChange: (party: StayGuestParty) => void;
};

export default function StayGuestPartySelector({ id, party, policy, maxGuests, onChange }: Props) {
  const copy = stayGuestAgeCopy(policy);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = [
    ['adults', 'Adults', copy.adult, 1],
    ['children', 'Children', copy.child, 0],
    ['infants', 'Infants', copy.infant, 0],
  ] as const;

  function bump(key: 'adults' | 'children' | 'infants', delta: number) {
    const next = { ...party, [key]: party[key] + delta };
    if (maxGuests == null) {
      setNotice('Guest capacity is unavailable for this stay.');
      return;
    }
    const checked = validateStayGuestParty(next, policy, maxGuests);
    if (!checked.ok) {
      setNotice(checked.error);
      return;
    }
    setNotice(null);
    onChange(next);
  }

  return (
    <fieldset id={id} className="space-y-2">
      <legend className="text-sm font-medium tracking-tight text-ink">Guests</legend>
      <p className="text-[12.5px] leading-relaxed text-ink-muted">{copy.summary}</p>
      <div className="overflow-hidden rounded-xl bg-paper-raised shadow-[0_0_0_1px_rgba(28,25,23,0.08)]">
        {rows.map(([key, label, hint, min]) => {
          const value = party[key];
          return (
            <div key={key} className="flex items-center gap-3 border-b border-black/[0.06] px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="text-[12px] text-ink-muted">{hint.replace(`${label} `, '')}</p>
              </div>
              <button
                type="button"
                className="lux-flat flex h-11 w-11 items-center justify-center rounded-full text-finland hover:bg-finland/5 disabled:opacity-30"
                aria-label={`Fewer ${label.toLowerCase()}`}
                disabled={value <= min || maxGuests == null}
                onClick={() => bump(key, -1)}
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {value}
              </span>
              <button
                type="button"
                className="lux-flat flex h-11 w-11 items-center justify-center rounded-full text-finland hover:bg-finland/5 disabled:opacity-30"
                aria-label={`More ${label.toLowerCase()}`}
                disabled={maxGuests == null}
                onClick={() => bump(key, 1)}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      {notice ? <p className="text-sm text-red-700">{notice}</p> : null}
    </fieldset>
  );
}
