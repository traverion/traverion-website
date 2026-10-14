import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';

/**
 * Horizontal, snap-scrolling step chips for mobile creation / option / schedule shells.
 */
export function ListingCreationMobileStepStrip({
  items,
  ariaLabel,
  onSelectIndex,
}: {
  items: ListingCreationNavItem[];
  ariaLabel: string;
  onSelectIndex: (index: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="listing-creation-mobile-steps -mx-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ol className="flex w-max items-center gap-1.5">
        {items.map((item, index) => {
          const current = item.state === 'current';
          const complete = item.state === 'complete';
          const locked = item.state === 'locked';
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (locked) return;
                  onSelectIndex(index);
                }}
                disabled={locked}
                aria-current={current ? 'step' : undefined}
                aria-label={`${item.label}${complete ? ', complete' : current ? ', current' : locked ? ', locked' : ''}`}
                className={`lux-flat inline-flex min-h-9 max-w-[9.5rem] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073B83]/35 disabled:opacity-45 ${
                  current
                    ? 'bg-[#073B83] text-white'
                    : complete
                      ? 'bg-[rgba(7,59,131,0.08)] text-[#073B83] ring-1 ring-[rgba(7,59,131,0.2)]'
                      : 'bg-[#F5F6F8] text-[#667085] ring-1 ring-[#E5E7EB]'
                }`}
              >
                <span className="tabular-nums opacity-80" aria-hidden>
                  {complete && !current ? '✓' : index + 1}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
