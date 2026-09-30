import { Check } from 'lucide-react';
import { listingCreationSceneCopy } from '../../../lib/listing-creation-scenes';

export function ListingCreationSceneProgress({
  index,
  total,
  labels,
  ariaLabel,
  canSelect,
  onSelect,
}: {
  index: number;
  total: number;
  labels: readonly string[];
  ariaLabel: string;
  canSelect?: (index: number) => boolean;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="listing-creation-scene-progress flex items-center gap-3">
      <p className="text-[11px] font-medium tabular-nums tracking-wide text-ink-muted">
        {listingCreationSceneCopy(index, total)}
      </p>
      <ol className="listing-creation-scene-progress__track" aria-label={ariaLabel}>
        {Array.from({ length: total }, (_, i) => {
          const current = i === index;
          const complete = i < index;
          const selectable = canSelect?.(i) ?? true;
          const label = labels[i] ?? `Scene ${i + 1}`;
          const stateSuffix = complete
            ? ', complete'
            : current
              ? ', current'
              : selectable
                ? ''
                : ', locked';
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  if (!selectable) return;
                  onSelect?.(i);
                }}
                disabled={!selectable}
                aria-current={current ? 'step' : undefined}
                aria-label={`${label}, scene ${i + 1} of ${total}${stateSuffix}`}
                className={`lux-flat flex min-h-11 min-w-11 items-center justify-center rounded-full p-3 disabled:cursor-default ${
                  current || complete
                    ? 'text-finland'
                    : selectable
                      ? 'text-ink-faint hover:text-ink-muted'
                      : 'text-ink-faint/70'
                }`}
              >
                {complete ? (
                  <Check className="h-3 w-3 text-finland" strokeWidth={2.75} aria-hidden />
                ) : (
                  <span
                    className={`listing-creation-scene-progress__dot ${
                      current
                        ? 'listing-creation-scene-progress__dot--current'
                        : ''
                    }`}
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
