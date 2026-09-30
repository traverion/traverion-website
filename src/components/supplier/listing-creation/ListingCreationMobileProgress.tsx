import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { ListingCreationNavButton } from './ListingCreationNavButton';

export function ListingCreationMobileProgress({
  title,
  persistLabel,
  progressCopy,
  items,
  navLabel,
  currentLabel,
  onSelectIndex,
  onExit,
  exitDisabled,
  exitBusy,
}: {
  title: string;
  persistLabel: string | null;
  progressCopy: string;
  items: ListingCreationNavItem[];
  navLabel: string;
  currentLabel: string;
  onSelectIndex: (index: number) => void;
  onExit: () => void;
  exitDisabled: boolean;
  exitBusy: boolean;
}) {
  return (
    <div className="listing-creation-mobile-bar shrink-0 border-b border-black/[0.08] px-4 pb-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={exitDisabled}
          onClick={onExit}
          className="lux-flat inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {exitBusy ? 'Saving…' : '← Exit'}
        </button>
        {persistLabel ? (
          <p
            className={`text-xs tabular-nums ${
              persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
            }`}
            aria-live="polite"
          >
            {persistLabel}
          </p>
        ) : (
          <span className="min-h-11" />
        )}
      </div>
      <p className="mt-1 font-display text-[1.65rem] font-bold leading-tight tracking-tight text-ink">{title}</p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{currentLabel}</p>
        {progressCopy ? <p className="text-xs font-medium tabular-nums text-ink-muted">{progressCopy}</p> : null}
      </div>
      {items.length > 0 ? (
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-black/[0.08]"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-finland transition-[width] duration-200 motion-reduce:transition-none"
            style={{
              width: `${Math.max(
                8,
                Math.round(
                  ((items.findIndex((item) => item.state === 'current') + 1) / items.length) * 100
                )
              )}%`,
            }}
          />
        </div>
      ) : null}
      <nav aria-label={navLabel} className="mt-2">
        {/* Phase 1615: column count follows step count (stay wizard has 6; tours 5). */}
        <ol
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
        >
          {items.map((item, index) => (
            <li key={item.id} className="min-w-0">
              <ListingCreationNavButton compact item={item} onClick={() => onSelectIndex(index)} />
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
