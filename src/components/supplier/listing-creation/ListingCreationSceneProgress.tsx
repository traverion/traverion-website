import { Check } from 'lucide-react';

/**
 * Substep progress for Basics / Information / Options / Schedule guided flows.
 * Shows short labels with current / complete / upcoming states (readiness-based).
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
    <nav className="listing-creation-scene-progress shrink-0" aria-label={ariaLabel}>
      <ol className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {Array.from({ length: total }, (_, i) => {
          const current = i === index;
          const complete = isComplete?.(i) ?? false;
          const selectable = canSelect?.(i) ?? true;
          const label = labels[i] ?? `Step ${i + 1}`;
          const short =
            label.length > 14 ? `${label.slice(0, 12).trimEnd()}…` : label;
          const stateSuffix = complete
            ? ', complete'
            : current
              ? ', current'
              : selectable
                ? ''
                : ', locked';
          return (
            <li key={`${label}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  if (!selectable) return;
                  onSelect?.(i);
                }}
                disabled={!selectable}
                aria-current={current ? 'step' : undefined}
                aria-label={`${label}, scene ${i + 1} of ${total}${stateSuffix}`}
                className={`lux-flat inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold tracking-tight transition-colors disabled:cursor-default ${
                  current
                    ? 'bg-finland text-white'
                    : complete
                      ? 'bg-finland/10 text-finland ring-1 ring-finland/20'
                      : selectable
                        ? 'bg-black/[0.04] text-ink-muted hover:bg-black/[0.07] hover:text-ink'
                        : 'bg-black/[0.03] text-ink-faint'
                }`}
              >
                {complete && !current ? (
                  <Check className="h-3 w-3 shrink-0" strokeWidth={2.75} aria-hidden />
                ) : (
                  <span className="tabular-nums opacity-80" aria-hidden>
                    {i + 1}
                  </span>
                )}
                <span className="max-w-[7.5rem] truncate sm:max-w-none">{short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
