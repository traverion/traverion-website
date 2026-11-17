import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type ListingPdpFaqItem = {
  question: string;
  answer: string;
};

type Props = {
  items: ListingPdpFaqItem[];
  title?: string;
  className?: string;
};

/** Accordion FAQ for PDP — only renders supplied Q&A (no invented answers). */
export default function ListingPdpFaq({
  items,
  title = 'Frequently asked questions',
  className = '',
}: Props) {
  const baseId = useId();
  const cleaned = items
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question && item.answer);
  const [openIndex, setOpenIndex] = useState<number | null>(cleaned.length === 1 ? 0 : null);
  if (cleaned.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="tv-section-heading">{title}</h2>
      <div className="mt-3 divide-y divide-[var(--tv-pdp-border,#E8EBF0)] rounded-xl border border-[var(--tv-pdp-border,#E8EBF0)] bg-white">
        {cleaned.map((item, index) => {
          const panelId = `${baseId}-panel-${index}`;
          const btnId = `${baseId}-btn-${index}`;
          const open = openIndex === index;
          return (
            <div key={`${item.question}-${index}`} className="min-w-0">
              <h3 className="m-0">
                <button
                  id={btnId}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold tracking-tight text-[#111827] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0758CB]/30"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex((cur) => (cur === index ? null : index))}
                >
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.question}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#64748B] transition-transform duration-200 motion-reduce:transition-none ${
                      open ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={btnId}
                hidden={!open}
                className="px-4 pb-3.5 text-[15px] leading-relaxed text-[#273244] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              >
                {open ? item.answer : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
