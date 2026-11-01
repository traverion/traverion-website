/**
 * Viewport-aware event edit popover for Week/Month calendar tiles.
 * Uses computeAnchoredPopoverBox (same positioning library as Stay booking).
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  computeAnchoredPopoverBox,
  type AnchoredPopoverBox,
} from '../../lib/anchored-popover';
import {
  partnerUnifiedEventKindLabel,
  type PartnerUnifiedCalendarEvent,
} from '../../lib/partner-unified-calendar';
import { openSupplierBooking } from '../../lib/supplierPortalNavigation';
import type { BookingRow } from '../../data/supabase-bookings';
import type { TourPackage } from '../../types/tour';
import PartnerUnifiedInlineAvailabilityEdit from './PartnerUnifiedInlineAvailabilityEdit';

const PREFERRED_WIDTH = 19 * 16;
const ESTIMATED_HEIGHT = 320;

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null> | RefObject<HTMLButtonElement | null>;
  event: PartnerUnifiedCalendarEvent;
  listing: TourPackage;
  bookings: BookingRow[];
  canEdit: boolean;
  userId?: string | null;
  onClose: () => void;
  onListingsChange: Dispatch<SetStateAction<TourPackage[]>>;
  /** Local availability refresh only — must not remount the calendar. */
  onSaved?: () => void;
  /** Extra class on the portaled panel (e.g. week marker for outside-click guards). */
  panelClassName?: string;
  children?: ReactNode;
};

function eventOpensBooking(event: PartnerUnifiedCalendarEvent): boolean {
  return Boolean(event.bookingId);
}

export default function PartnerUnifiedEventEditPopover({
  open,
  anchorRef,
  event,
  listing,
  bookings,
  canEdit,
  userId,
  onClose,
  onListingsChange,
  onSaved,
  panelClassName = '',
}: Props) {
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightRef = useRef(ESTIMATED_HEIGHT);
  const [panelBox, setPanelBox] = useState<AnchoredPopoverBox | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const [enterAnim, setEnterAnim] = useState(false);

  const panelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setPanelEl(node);
  }, []);

  const placePanel = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const panelNode = panelRef.current;
    if (panelNode) {
      const h = panelNode.getBoundingClientRect().height;
      if (h > 0) measuredHeightRef.current = h;
    }
    const vv = window.visualViewport;
    const viewportWidth = vv?.width ?? window.innerWidth;
    const viewportHeight = vv?.height ?? window.innerHeight;
    const next = computeAnchoredPopoverBox({
      anchorRect: el.getBoundingClientRect(),
      viewportWidth,
      viewportHeight,
      preferredWidth: PREFERRED_WIDTH,
      estimatedHeight: measuredHeightRef.current,
      edge: 8,
      gap: 8,
    });
    setPanelBox((prev) => {
      if (!prev) return next;
      if (prev.mode === 'sheet' && next.mode === 'sheet') return prev;
      if (prev.mode === 'popover' && next.mode === 'popover') {
        if (
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.maxHeight === next.maxHeight &&
          prev.placement === next.placement
        ) {
          return prev;
        }
      }
      return next;
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelBox(null);
      setEnterAnim(false);
      return;
    }
    setEnterAnim(true);
    placePanel();

    let rafLoop = 0;
    let scheduled = 0;
    const schedule = () => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        placePanel();
      });
    };
    // Short measurement loop so maxHeight tracks content after inline controls load.
    let frames = 0;
    const measureLoop = () => {
      placePanel();
      frames += 1;
      if (frames < 8) rafLoop = window.requestAnimationFrame(measureLoop);
    };
    rafLoop = window.requestAnimationFrame(measureLoop);

    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);

    const ro = new ResizeObserver(schedule);
    if (anchorRef.current) ro.observe(anchorRef.current);
    if (panelEl) ro.observe(panelEl);

    return () => {
      window.cancelAnimationFrame(rafLoop);
      if (scheduled) window.cancelAnimationFrame(scheduled);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [open, placePanel, panelEl, anchorRef]);

  useDialogFocus(open, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, onClose, anchorRef]);

  if (!open || !panelBox || typeof document === 'undefined') return null;

  const head = (
    <>
      <div className="partner-unified-cal__popover-head">
        <div className="partner-unified-cal__popover-titles">
          <strong>{event.listingTitle}</strong>
          {event.optionLabel ? (
            <span>{event.optionLabel}</span>
          ) : (
            <span>{partnerUnifiedEventKindLabel(event.kind)}</span>
          )}
        </div>
        <button
          type="button"
          className="partner-unified-cal__popover-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {eventOpensBooking(event) && event.bookingId ? (
        <button
          type="button"
          className="partner-unified-cal__open-booking"
          onClick={() =>
            openSupplierBooking(event.bookingId!, {
              family: event.category,
            })
          }
        >
          Open booking
        </button>
      ) : null}
      <PartnerUnifiedInlineAvailabilityEdit
        iso={event.ymd}
        listing={listing}
        bookings={bookings}
        event={event}
        canEdit={canEdit}
        userId={userId}
        onListingsChange={onListingsChange}
        onSaved={onSaved}
      />
    </>
  );

  const panelClass = [
    'partner-unified-cal__popover',
    'partner-unified-cal__popover--anchored',
    enterAnim ? 'is-enter' : '',
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  if (panelBox.mode === 'sheet') {
    return createPortal(
      <div className="partner-unified-cal__popover-sheet" role="presentation">
        <button
          type="button"
          tabIndex={-1}
          className="partner-unified-cal__popover-sheet-backdrop"
          aria-label="Close"
          onClick={onClose}
        />
        <div
          ref={panelCallbackRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label="Edit availability"
          className={`${panelClass} partner-unified-cal__popover--sheet`}
        >
          {head}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={panelCallbackRef}
      id={panelId}
      role="dialog"
      aria-modal="true"
      aria-label="Edit availability"
      className={panelClass}
      data-placement={panelBox.placement}
      style={{
        position: 'fixed',
        top: panelBox.top,
        left: panelBox.left,
        width: panelBox.width,
        maxHeight: panelBox.maxHeight,
        zIndex: 80,
      }}
      onAnimationEnd={() => setEnterAnim(false)}
    >
      {head}
    </div>,
    document.body
  );
}
