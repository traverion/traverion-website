import { Check } from 'lucide-react';

/**
 * Substep progress for Basics / Information / Options / Schedule guided flows.
 * Shows full labels with current / complete / upcoming states (readiness-based).
 * Labels are not ellipsis-truncated when space allows; wrap or scroll on small screens.
 */
export function ListingCreationSceneProgress({
  index,
  total,
  labels,
  ariaLabel,
  canSelect,
  isComplete,
  onSelect,
}: {
  index: number;
  total: number;
  labels: readonly string[];
  ariaLabel: string;
  canSelect?: (index: number) => boolean;
  /** Real readiness — never treat “visited / behind current” as complete. */
  isComplete?: (index: number) => boolean;
  onSelect?: (index: number) => void;
}) {
  return (
    <nav className="listing-creation-scene-progress w-full min-w-0" aria-label={ariaLabel}>
      <ol className="listing-creation-scene-progress__list flex flex-wrap items-center gap-1.5 sm:gap-2">
        {Array.from({ length: total }, (_, i) => {
          const current = i === index;
          const complete = isComplete?.(i) ?? false;
          const selectable = canSelect?.(i) ?? true;
          const label = labels[i] ?? `Step ${i + 1}`;
          const stateSuffix = complete
            ? ', complete'
            : current
              ? ', current'
              : selectable
                ? ''
                : ', locked';
          return (
            <li key={`${label}-${i}`} className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (!selectable) return;
                  onSelect?.(i);
                }}
                disabled={!selectable}
                aria-current={current ? 'step' : undefined}
                aria-label={`${label}, scene ${i + 1} of ${total}${stateSuffix}`}
                className={`lux-flat inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-[background-color,color,box-shadow,transform] duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 focus-visible:ring-offset-1 disabled:cursor-default sm:min-h-9 sm:px-3 sm:text-[12px] ${
                  current
                    ? 'bg-finland text-white shadow-md shadow-finland/25'
                    : complete
                      ? 'bg-finland/10 text-finland ring-1 ring-finland/25'
                      : selectable
                        ? 'bg-black/[0.04] text-ink-muted ring-1 ring-black/[0.05] hover:bg-black/[0.07] hover:text-ink'
                        : 'bg-black/[0.025] text-ink-faint ring-1 ring-transparent'
                }`}
              >
                {complete && !current ? (
                  <Check className="h-3 w-3 shrink-0" strokeWidth={2.75} aria-hidden />
                ) : (
                  <span className="tabular-nums opacity-80" aria-hidden>
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0 whitespace-nowrap">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
