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
    <section className="tv-pdp-section">
      <h2 className="tv-section-heading">What you’ll do</h2>
      {text ? (
        <>
          <p
            id="tour-overview-description"
            className={`max-w-xl text-[15px] leading-[1.65] text-[#273244] break-words [overflow-wrap:anywhere] whitespace-pre-wrap transition-[max-height] duration-200 motion-reduce:transition-none ${
              long && !open ? 'max-h-[14rem] overflow-hidden' : ''
            }`}
          >
            {shown}
          </p>
          {long ? (
            <button
              type="button"
              className="mt-2.5 text-sm font-semibold text-[#0758CB] hover:underline"
              aria-expanded={open}
              aria-controls="tour-overview-description"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      ) : null}
      {extras.length > 0 ? (
        <ul className="mt-4 max-w-xl space-y-1.5 text-sm leading-relaxed text-[#273244]">
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
