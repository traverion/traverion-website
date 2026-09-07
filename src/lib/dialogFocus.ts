/** Keyboard focus helpers for dialogs and sheets. */

export const DIALOG_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type TabWrapTarget = 'first' | 'last' | null;

export function tabWrapTarget(opts: {
  shiftKey: boolean;
  itemCount: number;
  activeIsFirst: boolean;
  activeIsLast: boolean;
  activeOutside: boolean;
}): TabWrapTarget {
  if (opts.itemCount === 0) return null;
  if (opts.shiftKey && (opts.activeIsFirst || opts.activeOutside)) return 'last';
  if (!opts.shiftKey && (opts.activeIsLast || opts.activeOutside)) return 'first';
  return null;
}

export function getDialogFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if ((el as HTMLButtonElement | HTMLInputElement).disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  });
}

export function handleDialogTab(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const items = getDialogFocusable(root);
  const active = document.activeElement;
  const wrap = tabWrapTarget({
    shiftKey: event.shiftKey,
    itemCount: items.length,
    activeIsFirst: items.length > 0 && active === items[0],
    activeIsLast: items.length > 0 && active === items[items.length - 1],
    activeOutside: !(active instanceof Node) || !root.contains(active),
  });
  if (wrap === 'first') {
    event.preventDefault();
    items[0]?.focus();
  } else if (wrap === 'last') {
    event.preventDefault();
    items[items.length - 1]?.focus();
  } else if (items.length === 0) {
    event.preventDefault();
  }
}

/** WCAG relative luminance for a #rrggbb hex. */
export function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '');
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(parseInt(n.slice(0, 2), 16));
  const g = toLinear(parseInt(n.slice(2, 4), 16));
  const b = toLinear(parseInt(n.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
