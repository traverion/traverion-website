import type { ListingCreationContextNav } from '../../../lib/listing-creation-workspace';
import { ListingCreationNavButton } from './ListingCreationNavButton';

/** Optional nested-object rail. Render only when a real nested workflow is supplied. */
export function ListingCreationContextRail({ nav }: { nav: ListingCreationContextNav }) {
  return (
    <aside className="listing-creation-context-rail hidden min-h-0 w-52 shrink-0 flex-col border-r border-black/[0.08] lg:flex">
      <div className="px-4 pb-3 pt-8">
        <p className="font-display text-xl font-bold leading-snug tracking-tight text-ink">{nav.title}</p>
      </div>
      <nav aria-label={nav.title} className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <ol className="space-y-0.5">
          {nav.items.map((item) => (
            <li key={item.id}>
              <ListingCreationNavButton item={item} onClick={() => nav.onSelect?.(item.id)} />
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
