import { useEffect, useRef, type RefObject } from 'react';
import { getDialogFocusable, handleDialogTab } from '../lib/dialogFocus';

const dialogStack: Array<() => void> = [];

/**
 * When `open`, move focus into `containerRef`, trap Tab, restore on close.
 * Escape closes the topmost dialog even if focus has not yet moved inside.
 */
export function useDialogFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = () => onCloseRef.current?.();
    dialogStack.push(close);

    let frame = 0;
    const focusFirst = () => {
      const root = containerRef.current;
      if (!root) {
        frame = window.requestAnimationFrame(focusFirst);
        return;
      }
      const items = getDialogFocusable(root);
      if (items[0]) {
        items[0].focus();
        return;
      }
      if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
      root.focus();
    };
    frame = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== close) return;
      const root = containerRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab' && root) {
        handleDialogTab(event, root);
        if (event.defaultPrevented) event.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      const idx = dialogStack.lastIndexOf(close);
      if (idx >= 0) dialogStack.splice(idx, 1);
      previous?.focus?.();
    };
  }, [open, containerRef]);
}
