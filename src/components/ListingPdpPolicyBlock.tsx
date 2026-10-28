import { ShieldCheck } from 'lucide-react';

type Props = {
  title?: string;
  /** Bold one-line summary (e.g. free cancellation headline). */
  summary?: string | null;
  body: string;
  className?: string;
};

/** Tour-style cancellation / policy presentation shared across PDPs. */
export default function ListingPdpPolicyBlock({
  title = 'Cancellation',
  summary = null,
  body,
  className = '',
}: Props) {
  const text = body.trim();
  if (!text && !summary?.trim()) return null;
  return (
    <section className={className}>
      <h2 className="tv-section-heading">{title}</h2>
      <div className="mt-3 flex max-w-xl gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EEF6F3] text-[#0F766E]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          {summary?.trim() ? (
            <p className="text-sm font-bold tracking-tight text-[#111827]">{summary.trim()}</p>
          ) : null}
          {text ? (
            <p
              className={`text-[15px] leading-relaxed text-ink ${
                summary?.trim() ? 'mt-1.5 text-ink-muted' : ''
              } whitespace-pre-wrap break-words [overflow-wrap:anywhere]`}
            >
              {text}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
