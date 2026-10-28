import type { LucideIcon } from 'lucide-react';

export type ListingPdpQuickFact = {
  label: string;
  value: string;
  icon: LucideIcon;
};

type Props = {
  facts: ListingPdpQuickFact[];
  className?: string;
};

/** Tour-style icon tiles for PDP key facts (shared by Tour / Stay / Rental). */
export default function ListingPdpQuickFacts({ facts, className = '' }: Props) {
  if (facts.length === 0) return null;
  return (
    <dl className={`grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 ${className}`.trim()}>
      {facts.map((fact) => {
        const Icon = fact.icon;
        return (
          <div key={`${fact.label}:${fact.value}`} className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5F7FA] text-[#0B397E]">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <dd className="text-sm font-bold leading-snug tracking-tight text-[#111827]">{fact.value}</dd>
              <dt className="mt-0.5 text-[11px] font-medium leading-snug text-ink-muted">{fact.label}</dt>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
