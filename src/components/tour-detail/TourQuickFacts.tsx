import type { TourPackage } from '../../types/tour';
import { tourQuickFacts } from '../../lib/tour-quick-facts';

type Props = {
  tour: TourPackage;
};

export default function TourQuickFacts({ tour }: Props) {
  const facts = tourQuickFacts(tour);
  if (facts.length === 0) return null;
  return (
    <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-paper-raised px-4 py-4 sm:grid-cols-3 sm:px-5 sm:py-5 lg:grid-cols-5 ring-1 ring-black/[0.06] shadow-soft">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{fact.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-ink leading-snug">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
