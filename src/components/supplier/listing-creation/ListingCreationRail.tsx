import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { ListingCreationNavButton } from './ListingCreationNavButton';

export function ListingCreationRail({
  title,
  persistLabel,
  progressCopy,
  items,
  navLabel,
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
  onSelectIndex: (index: number) => void;
  onExit: () => void;
  exitDisabled: boolean;
  exitBusy: boolean;
}) {
  return (
    <aside className="listing-creation-rail hidden min-h-0 w-[15.75rem] shrink-0 flex-col border-r border-black/[0.08] lg:flex xl:w-[16.5rem]">
      <div className="px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          disabled={exitDisabled}
          onClick={onExit}
          className="lux-flat inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {exitBusy ? 'Saving…' : '← Exit'}
        </button>
        <p className="mt-6 font-display text-[1.7rem] leading-[1.15] tracking-tight text-ink">{title}</p>
        <div className="mt-2 min-h-5">
          {persistLabel ? (
            <p
              className={`text-xs tabular-nums ${
                persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
              }`}
              aria-live="polite"
            >
              {persistLabel}
            </p>
          ) : null}
        </div>
        {progressCopy ? <p className="mt-1 text-xs text-ink-muted">{progressCopy}</p> : null}
      </div>
      <nav aria-label={navLabel} className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <ol className="space-y-0.5">
          {items.map((item, index) => (
            <li key={item.id}>
              <ListingCreationNavButton item={item} onClick={() => onSelectIndex(index)} />
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
