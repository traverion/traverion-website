import type { ListingCreationContextNav } from '../../../lib/listing-creation-workspace';
import { ListingCreationNavButton } from './ListingCreationNavButton';

/** Optional nested-object rail. Render only when a real nested workflow is supplied. */
export function ListingCreationContextRail({
  nav,
  alwaysVisible = false,
}: {
  nav: ListingCreationContextNav;
  /** When true, show on all breakpoints (e.g. option modal shell). */
  alwaysVisible?: boolean;
}) {
  const completeCount = nav.items.filter((item) => item.state === 'complete').length;
  return (
    <aside
      className={`listing-creation-context-rail h-full min-h-0 w-52 shrink-0 flex-col overflow-hidden border-r border-black/[0.08] ${
        alwaysVisible ? 'flex' : 'hidden lg:flex'
      }`}
    >
      <div className="px-4 pb-3 pt-8">
        <p className="font-display text-xl font-bold leading-snug tracking-tight text-ink">{nav.title}</p>
        {nav.items.length > 0 ? (
          <>
            <p className="mt-1 text-xs font-medium tabular-nums text-ink-muted">
              {completeCount} of {nav.items.length} steps complete
            </p>
            <div
              className="listing-creation-rail-progress mt-2"
              role="progressbar"
              aria-label={`${nav.title} progress`}
              aria-valuemin={0}
              aria-valuemax={nav.items.length}
              aria-valuenow={completeCount}
            >
              <div
                className="listing-creation-rail-progress__fill"
                style={{ width: `${(completeCount / nav.items.length) * 100}%` }}
              />
            </div>
          </>
        ) : null}
      </div>
      <nav aria-label={nav.title} className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <ol className="space-y-0.5">
          {nav.items.map((item, index) => (
            <li key={item.id}>
              <ListingCreationNavButton item={item} step={index + 1} onClick={() => nav.onSelect?.(item.id)} />
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
