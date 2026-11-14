export type TraverionDatePanelBox =
  | { mode: 'sheet' }
  | {
      mode: 'popover';
      top: number;
      left: number;
      width: number;
      caret: number;
      placement: 'below' | 'above';
    };

/** Desktop popover anchored to the trigger, or a bottom sheet on narrow screens. */
export function placeTraverionDatePanel(button: HTMLElement, widthRem = 21.5): TraverionDatePanelBox {
  const isSheet = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
  if (isSheet) return { mode: 'sheet' };
  const rect = button.getBoundingClientRect();
  const edge = 8;
  const width = Math.min(widthRem * 16, window.innerWidth - edge * 2);
  let left = rect.left;
  if (left + width > window.innerWidth - edge) {
    left = Math.max(edge, window.innerWidth - width - edge);
  }
  if (left < edge) left = edge;
  const gap = 10;
  const panelH = 372;
  const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
  const spaceAbove = rect.top - gap - edge;
  const placement: 'below' | 'above' = spaceBelow >= panelH || spaceBelow >= spaceAbove ? 'below' : 'above';
  const top =
    placement === 'below'
      ? Math.min(rect.bottom + gap, window.innerHeight - edge)
      : Math.max(edge, rect.top - gap - panelH);
  const caret = Math.min(width - 16, Math.max(16, rect.left + rect.width / 2 - left));
  return { mode: 'popover', top, left, width, caret, placement };
}
