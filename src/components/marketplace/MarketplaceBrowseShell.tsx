import { useEffect, type ReactNode, type Ref } from 'react';
import { Filter, X } from 'lucide-react';

type Props = {
  headingId: string;
  resultTitle: ReactNode;
  familyNav?: ReactNode;
  search: ReactNode;
  mobileSearch: ReactNode;
  filterCount: number;
  filtersOpen: boolean;
  onOpenFilters: () => void;
  onCloseFilters: () => void;
  filterSheetRef: Ref<HTMLDivElement>;
  filterPanel: ReactNode;
  filterFooter?: ReactNode;
  sortControl: ReactNode;
  activeChips?: ReactNode;
  children: ReactNode;
};

export function MarketplaceBrowseShell({
  headingId,
  resultTitle,
  familyNav,
  search,
  mobileSearch,
  filterCount,
  filtersOpen,
  onOpenFilters,
  onCloseFilters,
  filterSheetRef,
  filterPanel,
  filterFooter,
  sortControl,
  activeChips,
  children,
}: Props) {
  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [filtersOpen]);

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-12">
        <div className="mb-5 space-y-3">
          {familyNav}
          {mobileSearch}
          {search}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              className="tv-btn-secondary h-11 flex-1"
              onClick={onOpenFilters}
              aria-expanded={filtersOpen}
              aria-controls={`${headingId}-filters`}
            >
              <Filter className="w-4 h-4" />
              Filters{filterCount > 0 ? ` · ${filterCount}` : ''}
            </button>
            <div className="flex-1">{sortControl}</div>
          </div>
        </div>

        {activeChips}

        <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-8 xl:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-[calc(4.25rem+env(safe-area-inset-top,0px))] max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain pr-1 space-y-6">
              <div className="flex items-baseline gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Filters</p>
                {filterCount > 0 ? (
                  <span className="text-[11px] font-semibold tabular-nums text-finland">· {filterCount}</span>
                ) : null}
              </div>
              {filterPanel}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 relative z-10 flex flex-wrap items-center justify-between gap-3">
              <h1 id={headingId} className="font-display text-xl sm:text-2xl text-ink tracking-tight">
                {resultTitle}
              </h1>
              <div className="hidden lg:block shrink-0">{sortControl}</div>
            </div>
            {children}
          </div>
        </div>
      </div>

      {filtersOpen ? (
        <div ref={filterSheetRef} className="tv-sheet-overlay lg:hidden">
          <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close filters" onClick={onCloseFilters} />
          <aside
            id={`${headingId}-filters`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${headingId}-filters-title`}
            className="tv-sheet-panel relative flex max-h-[min(92dvh,44rem)] flex-col overflow-hidden motion-safe:animate-slide-up"
          >
            <div className="mb-5 flex items-start justify-between gap-3 shrink-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Browse</p>
                <h2 id={`${headingId}-filters-title`} className="font-display text-xl text-ink tracking-tight mt-1">
                  Filters
                  {filterCount > 0 ? (
                    <span className="ml-2 align-middle text-base font-sans font-semibold text-finland tabular-nums">
                      · {filterCount}
                    </span>
                  ) : null}
                </h2>
              </div>
              <button type="button" onClick={onCloseFilters} className="lux-tap-target p-2 -mr-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">{filterPanel}</div>
            {filterFooter ? <div className="mt-5 flex gap-2 shrink-0">{filterFooter}</div> : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function MarketplaceFamilySwitch({
  current,
  onTours,
  onStays,
}: {
  current: 'tours' | 'stays';
  onTours: () => void;
  onStays: () => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-black/[0.04] p-1 w-fit ring-1 ring-black/[0.06]" role="tablist" aria-label="Listing type">
      <button
        type="button"
        role="tab"
        aria-selected={current === 'tours'}
        onClick={onTours}
        className={`lux-flat rounded-full px-4 py-1.5 text-sm font-medium ${
          current === 'tours'
            ? 'bg-paper-raised text-ink shadow-sm ring-2 ring-finland/30'
            : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink'
        }`}
      >
        Tours
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === 'stays'}
        onClick={onStays}
        className={`lux-flat rounded-full px-4 py-1.5 text-sm font-medium ${
          current === 'stays'
            ? 'bg-paper-raised text-ink shadow-sm ring-2 ring-finland/30'
            : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink'
        }`}
      >
        Stays
      </button>
    </div>
  );
}

export function MarketplaceSortSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="inline-flex max-w-full items-center gap-2 rounded-full bg-paper-raised px-3 py-1 text-sm text-ink-muted shadow-soft ring-1 ring-black/[0.06]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 max-w-[11rem] bg-transparent text-sm font-medium text-ink"
        aria-label="Sort"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
