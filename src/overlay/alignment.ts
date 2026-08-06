export type GuideOrientation = 'vertical' | 'horizontal';

export type AlignmentGuide = {
  orientation: GuideOrientation;
  /** Position in the same coordinate space as overlays (top-left origin). */
  position: number;
};

export type SnapResult = {
  x: number;
  y: number;
  guides: AlignmentGuide[];
};

export type SnapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const NUDGE_AMOUNT = 1;
export const NUDGE_AMOUNT_SHIFT = 10;

export function nudgeDelta(
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  shiftKey: boolean,
): { dx: number; dy: number } {
  const step = shiftKey ? NUDGE_AMOUNT_SHIFT : NUDGE_AMOUNT;
  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };
    case 'ArrowRight':
      return { dx: step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -step };
    case 'ArrowDown':
      return { dx: 0, dy: step };
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function edges(rect: SnapRect): {
  left: number;
  right: number;
  centerX: number;
  top: number;
  bottom: number;
  centerY: number;
} {
  return {
    left: rect.x,
    right: rect.x + rect.width,
    centerX: rect.x + rect.width / 2,
    top: rect.y,
    bottom: rect.y + rect.height,
    centerY: rect.y + rect.height / 2,
  };
}

/**
 * Snap a moving rect to other overlays' edges/centers within `threshold` px.
 */
export function snapToGuides(
  x: number,
  y: number,
  w: number,
  h: number,
  others: SnapRect[],
  threshold = 5,
): SnapResult {
  const moving = edges({ x, y, width: w, height: h });
  let bestDx: number | null = null;
  let bestDy: number | null = null;
  let bestAbsDx = threshold + 1;
  let bestAbsDy = threshold + 1;
  const guides: AlignmentGuide[] = [];

  const tryX = (movingEdge: number, target: number, guidePos: number): void => {
    const dx = target - movingEdge;
    const abs = Math.abs(dx);
    if (abs <= threshold && abs < bestAbsDx) {
      bestAbsDx = abs;
      bestDx = dx;
      // Replace vertical guides when a closer snap wins
      for (let i = guides.length - 1; i >= 0; i--) {
        if (guides[i]!.orientation === 'vertical') guides.splice(i, 1);
      }
      guides.push({ orientation: 'vertical', position: guidePos });
    } else if (abs <= threshold && abs === bestAbsDx && bestDx === dx) {
      if (!guides.some((g) => g.orientation === 'vertical' && g.position === guidePos)) {
        guides.push({ orientation: 'vertical', position: guidePos });
      }
    }
  };

  const tryY = (movingEdge: number, target: number, guidePos: number): void => {
    const dy = target - movingEdge;
    const abs = Math.abs(dy);
    if (abs <= threshold && abs < bestAbsDy) {
      bestAbsDy = abs;
      bestDy = dy;
      for (let i = guides.length - 1; i >= 0; i--) {
        if (guides[i]!.orientation === 'horizontal') guides.splice(i, 1);
      }
      guides.push({ orientation: 'horizontal', position: guidePos });
    } else if (abs <= threshold && abs === bestAbsDy && bestDy === dy) {
      if (
        !guides.some((g) => g.orientation === 'horizontal' && g.position === guidePos)
      ) {
        guides.push({ orientation: 'horizontal', position: guidePos });
      }
    }
  };

  for (const other of others) {
    const o = edges(other);
    const xTargets = [o.left, o.centerX, o.right];
    const yTargets = [o.top, o.centerY, o.bottom];
    const movingXs = [moving.left, moving.centerX, moving.right];
    const movingYs = [moving.top, moving.centerY, moving.bottom];

    for (const mx of movingXs) {
      for (const tx of xTargets) {
        tryX(mx, tx, tx);
      }
    }
    for (const my of movingYs) {
      for (const ty of yTargets) {
        tryY(my, ty, ty);
      }
    }
  }

  return {
    x: bestDx !== null ? x + bestDx : x,
    y: bestDy !== null ? y + bestDy : y,
    guides,
  };
}
