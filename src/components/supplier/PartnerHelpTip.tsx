import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { computeAnchoredPopoverBox } from '../../lib/anchored-popover';

type PartnerHelpTipProps = {
  /** Accessible name for the trigger, e.g. "About brand name". */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Small blue circled ? — opens a short tip on click/tap/keyboard.
 * Never opens automatically. Desktop popover; mobile bottom sheet.
 */
export default function PartnerHelpTip({ label, children, className = '' }: PartnerHelpTipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [box, setBox] = useState<ReturnType<typeof computeAnchoredPopoverBox> | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const el = btnRef.current;
    if (!el || !open) return;
    const rect = el.getBoundingClientRect();
    const measured = panelRef.current?.getBoundingClientRect().height ?? 120;
    setBox(
      computeAnchoredPopoverBox({
        anchorRect: rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        preferredWidth: 280,
        estimatedHeight: measured,
        sheetMaxWidth: 639,
      })
    );
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    reposition();
  }, [open, reposition, children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        btnRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onResize = () => reposition();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, close, reposition]);

  const toggle = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  };

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            {box?.mode === 'sheet' ? (
              <div
                className="fixed inset-0 z-[120] bg-black/25"
                aria-hidden
                onClick={close}
              />
            ) : null}
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={label}
              className={
                box?.mode === 'sheet'
                  ? 'fixed inset-x-0 bottom-0 z-[121] rounded-t-2xl border border-[#dbe4f0] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-lg'
                  : 'fixed z-[121] rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-[13px] leading-snug text-[#1e3a5f] shadow-lg'
              }
              style={
                box?.mode === 'popover'
                  ? {
                      top: box.top,
                      left: box.left,
                      width: box.width,
                      maxHeight: box.maxHeight,
                    }
                  : box?.mode === 'sheet'
                    ? undefined
                    : { visibility: 'hidden' as const }
              }
            >
              {box?.mode === 'sheet' ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#18181b]">{label}</p>
                  <button
                    type="button"
                    className="min-h-10 px-2 text-[13px] font-semibold text-[#073b83]"
                    onClick={close}
                  >
                    Close
                  </button>
                </div>
              ) : null}
              <div className="text-[13px] leading-snug text-[#1e3a5f]">{children}</div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="inline-grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[#073b83] bg-white text-[10px] font-bold leading-none text-[#073b83] hover:bg-[#f0f4fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83]"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggle(e);
        }}
      >
        ?
      </button>
      {panel}
    </span>
  );
}
