/**
 * Position a fixed popover relative to an anchor element.
 * Flips above when there is not enough space below. Used by Stay booking controls.
 */

export type AnchoredPopoverBox =
  | { mode: 'popover'; top: number; left: number; width: number; placement: 'below' | 'above' }
  | { mode: 'sheet' };

export type AnchorRectLike = Pick<DOMRect, 'top' | 'left' | 'bottom' | 'right' | 'width' | 'height'>;

export function computeAnchoredPopoverBox(params: {
  anchorRect: AnchorRectLike;
  viewportWidth: number;
  viewportHeight: number;
  /** Preferred panel width in px. */
  preferredWidth: number;
  /** Estimated panel height for flip calculation. */
  estimatedHeight: number;
  edge?: number;
  gap?: number;
  /** Force bottom sheet below this width (inclusive). */
  sheetMaxWidth?: number;
}): AnchoredPopoverBox {
  const edge = params.edge ?? 8;
  const gap = params.gap ?? 8;
  const sheetMax = params.sheetMaxWidth ?? 639;
  if (params.viewportWidth <= sheetMax) {
    return { mode: 'sheet' };
  }
  const width = Math.min(params.preferredWidth, params.viewportWidth - edge * 2);
  let left = params.anchorRect.left;
  if (left + width > params.viewportWidth - edge) {
    left = Math.max(edge, params.viewportWidth - width - edge);
  }
  if (left < edge) left = edge;

  const spaceBelow = params.viewportHeight - params.anchorRect.bottom - gap - edge;
  const spaceAbove = params.anchorRect.top - gap - edge;
  const preferBelow = spaceBelow >= params.estimatedHeight || spaceBelow >= spaceAbove;
  if (preferBelow) {
    return {
      mode: 'popover',
      placement: 'below',
      top: Math.min(params.anchorRect.bottom + gap, params.viewportHeight - edge),
      left,
      width,
    };
  }
  return {
    mode: 'popover',
    placement: 'above',
    top: Math.max(edge, params.anchorRect.top - gap - params.estimatedHeight),
    left,
    width,
  };
}
