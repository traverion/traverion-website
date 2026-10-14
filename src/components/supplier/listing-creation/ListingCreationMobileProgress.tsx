import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { ListingCreationMobileStepStrip } from './ListingCreationMobileStepStrip';

/**
 * App-style top chrome for listing creation on phones / tablets (&lt; lg).
 */
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
  const done = items.filter((item) => item.state === 'complete').length;
  const progressPct =
    items.length > 0 ? Math.max(6, Math.round((done / items.length) * 100)) : 0;

  return (
    <div className="listing-creation-mobile-bar shrink-0 border-b border-[#E5E7EB] bg-white lg:hidden">
      <div className="px-4 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exitDisabled}
            onClick={onExit}
            className="lux-flat inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-[#667085] hover:bg-[#F5F6F8] hover:text-[#17191D] disabled:opacity-50"
            aria-label={exitBusy ? 'Saving' : 'Exit'}
          >
            {exitBusy ? '…' : '←'}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight text-[#17191D]">{title}</p>
            <p className="truncate text-[12px] text-[#667085]">
              {currentLabel}
              {progressCopy ? ` · ${progressCopy}` : ''}
            </p>
          </div>
          {persistLabel ? (
            <p
              className={`shrink-0 text-[11px] tabular-nums ${
                persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-[#667085]'
              }`}
              aria-live="polite"
            >
              {persistLabel}
            </p>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div
            className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#F5F6F8]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
            aria-label="Listing setup progress"
          >
            <div
              className="h-full rounded-full bg-[#073B83] transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}

        <div className="mt-2.5">
          <ListingCreationMobileStepStrip
            items={items}
            ariaLabel={navLabel}
            onSelectIndex={onSelectIndex}
          />
        </div>
      </div>
    </div>
  );
}
