/**
 * Position a fixed popover relative to an anchor element (viewport coordinates).
 * Flips above when there is not enough space below. Clamps so the panel stays
 * inside the viewport. Used by Stay booking controls.
 */

export type AnchoredPopoverBox =
  | {
      mode: 'popover';
      top: number;
      left: number;
      width: number;
      placement: 'below' | 'above';
      /** Optional max height so the panel can scroll instead of overflowing. */
      maxHeight: number;
    }
  | { mode: 'sheet' };

export type AnchorRectLike = Pick<DOMRect, 'top' | 'left' | 'bottom' | 'right' | 'width' | 'height'>;

export function computeAnchoredPopoverBox(params: {
  anchorRect: AnchorRectLike;
  viewportWidth: number;
  viewportHeight: number;
  /** Preferred panel width in px. */
  preferredWidth: number;
  /** Estimated or measured panel height for flip/clamp calculation. */
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

  const height = Math.max(1, params.estimatedHeight);
  const spaceBelow = params.viewportHeight - params.anchorRect.bottom - gap - edge;
  const spaceAbove = params.anchorRect.top - gap - edge;

  let placement: 'below' | 'above';
  if (spaceBelow >= height) placement = 'below';
  else if (spaceAbove >= height) placement = 'above';
  else placement = spaceBelow >= spaceAbove ? 'below' : 'above';

  if (placement === 'below') {
    const top = params.anchorRect.bottom + gap;
    const maxHeight = Math.max(120, Math.min(height, params.viewportHeight - top - edge));
    // Keep the panel origin on-screen; never pin top to the viewport bottom.
    const clampedTop = Math.min(top, Math.max(edge, params.viewportHeight - edge - Math.min(maxHeight, height)));
    return {
      mode: 'popover',
      placement: 'below',
      top: Math.max(edge, clampedTop),
      left,
      width,
      maxHeight,
    };
  }

  const idealTop = params.anchorRect.top - gap - height;
  const top = Math.max(edge, idealTop);
  const maxHeight = Math.max(120, Math.min(height, params.anchorRect.top - gap - top));
  return {
    mode: 'popover',
    placement: 'above',
    top,
    left,
    width,
    maxHeight,
  };
}

/**
 * Compact action / suggestion menu box in viewport coordinates.
 * Always stays a fixed popover (no mobile sheet). Flips above when space below
 * is insufficient. Use align: 'end' for kebab menus tied to a trigger's right edge.
 */
export type AnchoredActionMenuBox = {
  top: number;
  left: number;
  width: number;
  placement: 'below' | 'above';
};

export function computeAnchoredActionMenuBox(params: {
  anchorRect: AnchorRectLike;
  viewportWidth: number;
  viewportHeight: number;
  preferredWidth: number;
  estimatedHeight: number;
  align?: 'start' | 'end';
  edge?: number;
  gap?: number;
}): AnchoredActionMenuBox {
  const edge = params.edge ?? 8;
  const gap = params.gap ?? 6;
  const align = params.align ?? 'end';
  const width = Math.min(Math.max(1, params.preferredWidth), Math.max(1, params.viewportWidth - edge * 2));

  let left =
    align === 'end' ? params.anchorRect.right - width : params.anchorRect.left;
  if (left + width > params.viewportWidth - edge) {
    left = Math.max(edge, params.viewportWidth - width - edge);
  }
  if (left < edge) left = edge;

  const height = Math.max(1, params.estimatedHeight);
  const spaceBelow = params.viewportHeight - params.anchorRect.bottom - gap - edge;
  const spaceAbove = params.anchorRect.top - gap - edge;

  let placement: 'below' | 'above';
  if (spaceBelow >= height) placement = 'below';
  else if (spaceAbove >= height) placement = 'above';
  else placement = spaceBelow >= spaceAbove ? 'below' : 'above';

  if (placement === 'below') {
    const top = params.anchorRect.bottom + gap;
    return {
      top: Math.min(top, Math.max(edge, params.viewportHeight - edge - height)),
      left,
      width,
      placement,
    };
  }

  return {
    top: Math.max(edge, params.anchorRect.top - gap - height),
    left,
    width,
    placement,
  };
}
