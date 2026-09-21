import { listingCreationSceneCopy } from '../../../lib/listing-creation-scenes';

export function ListingCreationSceneProgress({
  index,
  total,
  labels,
  canSelect,
  onSelect,
}: {
  index: number;
  total: number;
  labels: readonly string[];
  canSelect?: (index: number) => boolean;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="listing-creation-scene-progress flex items-center gap-3">
      <p className="text-[11px] font-medium tabular-nums tracking-wide text-ink-muted">
        {listingCreationSceneCopy(index, total)}
      </p>
      <ol className="flex items-center gap-1.5" aria-label="Basics scenes">
        {Array.from({ length: total }, (_, i) => {
          const current = i === index;
          const selectable = canSelect?.(i) ?? true;
          const label = labels[i] ?? `Scene ${i + 1}`;
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
                aria-label={`${label}, scene ${i + 1} of ${total}${current ? ', current' : ''}`}
                className={`lux-flat block min-h-11 min-w-11 rounded-full p-3 disabled:cursor-default ${
                  current ? 'text-finland' : selectable ? 'text-ink-faint hover:text-ink-muted' : 'text-ink-faint/70'
                }`}
              >
                <span
                  className={`block h-1.5 w-1.5 rounded-full ${
                    current ? 'bg-finland' : 'bg-current'
                  }`}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
