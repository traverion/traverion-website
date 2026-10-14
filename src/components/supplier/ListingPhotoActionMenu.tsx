import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type MenuPos = { top: number; left: number; openUp: boolean };

/**
 * Floating photo actions menu — portaled above gallery overflow so it never clips.
 * Repositions near viewport edges; closes on outside pointer, Escape, or caller dismiss.
 */
export function ListingPhotoActionMenu({
  anchorEl,
  open,
  onClose,
  children,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchorEl.getBoundingClientRect();
      const menu = menuRef.current;
      const mw = menu?.offsetWidth ?? 168;
      const mh = menu?.offsetHeight ?? 220;
      const pad = 8;
      const gap = 4;
      let left = a.right - mw;
      left = Math.min(Math.max(pad, left), window.innerWidth - mw - pad);
      const spaceBelow = window.innerHeight - a.bottom - pad;
      const openUp = spaceBelow < mh && a.top > spaceBelow;
      const top = openUp ? a.top - mh - gap : a.bottom + gap;
      setPos({
        top: Math.min(Math.max(pad, top), window.innerHeight - mh - pad),
        left,
        openUp,
      });
    };
    place();
    // Second pass after content paints for accurate height.
    const raf = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorEl, children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onClose, anchorEl]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[120] min-w-[10.5rem] overflow-hidden rounded-lg border border-[#E7E9ED] bg-white shadow-lg"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: -9999, left: -9999, visibility: 'hidden' as const }
      }
    >
      {children}
    </div>,
    document.body
  );
}

export function photoMenuItemClass(danger = false): string {
  return danger
    ? 'lux-flat block w-full px-3 py-2 text-left text-[13px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300 disabled:opacity-40'
    : 'lux-flat block w-full px-3 py-2 text-left text-[13px] font-medium text-ink hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-finland/30 disabled:opacity-40';
}
