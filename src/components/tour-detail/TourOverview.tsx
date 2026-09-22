import { useState } from 'react';

const COLLAPSE_AT = 420;

type Props = {
  description: string;
  extras?: string[];
};

export default function TourOverview({ description, extras = [] }: Props) {
  const text = description.trim();
  const long = text.length > COLLAPSE_AT;
  const [open, setOpen] = useState(false);
  const shown = long && !open ? `${text.slice(0, COLLAPSE_AT).replace(/\s+\S*$/, '')}…` : text;
  if (!text && extras.length === 0) return null;
  return (
    <section className="max-w-2xl">
      <h2 className="font-display text-xl text-ink mb-2">What you’ll do</h2>
      {text ? (
        <>
          <p className="text-[15px] leading-relaxed text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
            {shown}
          </p>
          {long ? (
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-finland hover:underline"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      ) : null}
      {extras.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm text-ink-muted">
          {extras.map((line) => (
            <li key={line} className="break-words [overflow-wrap:anywhere]">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
