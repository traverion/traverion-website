import type { ReactNode, Ref } from 'react';
import type {
  ListingCreationContextNav,
  ListingCreationNavItem,
} from '../../../lib/listing-creation-workspace';
import { ListingCreationContextRail } from './ListingCreationContextRail';
import { ListingCreationMobileProgress } from './ListingCreationMobileProgress';
import { ListingCreationRail } from './ListingCreationRail';

export function ListingCreationWorkspace({
  title,
  titleId,
  persistLabel,
  progressCopy,
  items,
  navLabel,
  currentLabel,
  onSelectIndex,
  onExit,
  exitDisabled,
  exitBusy,
  contextNav,
  banners,
  scrollRef,
  footer,
  overlay,
  children,
}: {
  title: string;
  titleId: string;
  persistLabel: string | null;
  progressCopy: string;
  items: ListingCreationNavItem[];
  navLabel: string;
  currentLabel: string;
  onSelectIndex: (index: number) => void;
  onExit: () => void;
  exitDisabled: boolean;
  exitBusy: boolean;
  /** Nested creation rail. Omit until a real nested workflow exists. */
  contextNav?: ListingCreationContextNav | null;
  banners?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  footer: ReactNode;
  /** Level-3 nested configuration surface. Covers the working column only. */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const headerProps = {
    title,
    persistLabel,
    progressCopy,
    items,
    navLabel,
    onSelectIndex,
    onExit,
    exitDisabled,
    exitBusy,
  };

  return (
    <div className="listing-creation-workspace flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <ListingCreationRail {...headerProps} />
      {contextNav ? <ListingCreationContextRail nav={contextNav} /> : null}
      <div className="listing-creation-main relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ListingCreationMobileProgress {...headerProps} currentLabel={currentLabel} />
        {banners}
        <div
          ref={scrollRef}
          className="listing-creation-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-8 sm:px-8 sm:py-8 lg:px-12 lg:py-12"
        >
          {children}
        </div>
        <div className="listing-creation-footer relative z-10 shrink-0 border-t border-black/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-4 lg:px-12">
          {footer}
        </div>
        {overlay}
      </div>
    </div>
  );
}
