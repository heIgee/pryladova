import { type KeyboardEvent, type PointerEvent, type ReactElement, useEffect, useRef } from "react";
import {
  type ColGrowPushResult,
  type ColSpan,
  type DashboardTileId,
  isColSpan,
  isRowSpan,
  type RowSpan,
  stepColSpan,
  stepRowSpan,
  stepSharedColBoundary,
  stepSharedRowBoundary,
} from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

/** Drag distance before snapping one span step. */
const RESIZE_STEP_PX = 56;

type ColResizeProps = {
  axis: "x";
  span: ColSpan;
  neighborSpan?: ColSpan;
  onDraftSpan: (span: ColSpan) => void;
  onDraftBoundary: (
    leftId: DashboardTileId,
    leftSpan: ColSpan,
    rightId: DashboardTileId,
    rightSpan: ColSpan,
  ) => void;
  onCommitSpan: (span: ColSpan) => void;
  onCommitBoundary: (
    leftId: DashboardTileId,
    leftSpan: ColSpan,
    rightId: DashboardTileId,
    rightSpan: ColSpan,
  ) => void;
};

type RowResizeProps = {
  axis: "y";
  span: RowSpan;
  neighborSpan?: RowSpan;
  onDraftSpan: (span: RowSpan) => void;
  onDraftBoundary: (
    topId: DashboardTileId,
    topSpan: RowSpan,
    bottomId: DashboardTileId,
    bottomSpan: RowSpan,
  ) => void;
  onCommitSpan: (span: RowSpan) => void;
  onCommitBoundary: (
    topId: DashboardTileId,
    topSpan: RowSpan,
    bottomId: DashboardTileId,
    bottomSpan: RowSpan,
  ) => void;
};

type ColResizeHandleProps = ColResizeProps & {
  edge: "left" | "right";
  tileId: DashboardTileId;
  neighborId?: DashboardTileId | null;
  onRevert: () => void;
  onTryColGrowPush?: () => ColGrowPushResult | null;
  onDraftColPush?: (result: ColGrowPushResult) => void;
  onCommitColPush?: (result: ColGrowPushResult) => void;
};

type RowResizeHandleProps = RowResizeProps & {
  edge: "top" | "bottom";
  tileId: DashboardTileId;
  neighborId?: DashboardTileId | null;
  onRevert: () => void;
  canStep?: (direction: 1 | -1) => boolean;
};

export const DashboardTileResizeHandle = (
  props: ColResizeHandleProps | RowResizeHandleProps,
): ReactElement => {
  if (props.axis === "x") {
    return <DashboardTileColResizeHandle {...props} />;
  }
  return <DashboardTileRowResizeHandle {...props} />;
};

const DashboardTileColResizeHandle = ({
  edge,
  tileId,
  span,
  neighborId,
  neighborSpan,
  onDraftSpan,
  onDraftBoundary,
  onCommitSpan,
  onCommitBoundary,
  onRevert,
  onTryColGrowPush,
  onDraftColPush,
  onCommitColPush,
}: ColResizeHandleProps) => {
  const isBoundary = neighborId != null && neighborSpan != null;
  const draftSelfRef = useRef<ColSpan>(span);
  const draftNeighborRef = useRef<ColSpan>(neighborSpan ?? span);
  const accumulatedDeltaRef = useRef(0);
  const gestureActiveRef = useRef(false);
  const usedColPushRef = useRef(false);
  const colPushAccumRef = useRef<ColGrowPushResult>({ colSpans: {}, anchors: {} });

  const primaryIds = (): {
    primaryId: DashboardTileId;
    secondaryId: DashboardTileId;
  } => {
    if (!isBoundary || neighborId == null) {
      return { primaryId: tileId, secondaryId: tileId };
    }
    if (edge === "right") {
      return { primaryId: tileId, secondaryId: neighborId };
    }
    return { primaryId: neighborId, secondaryId: tileId };
  };

  const stepDraftSolo = (direction: 1 | -1) => {
    const flipped = direction === 1 ? -1 : 1;
    const stepDirection = edge === "left" ? flipped : direction;
    const current = draftSelfRef.current;
    if (!isColSpan(current)) {
      return;
    }
    const next = stepColSpan(current, stepDirection);
    if (next === current) {
      return;
    }
    draftSelfRef.current = next;
    onDraftSpan(next);
  };

  const stepDraftBoundary = (direction: 1 | -1) => {
    if (!isBoundary || neighborId == null) {
      return;
    }
    const { primaryId, secondaryId } = primaryIds();
    const primarySpan = edge === "right" ? draftSelfRef.current : draftNeighborRef.current;
    const secondarySpan = edge === "right" ? draftNeighborRef.current : draftSelfRef.current;
    if (!isColSpan(primarySpan) || !isColSpan(secondarySpan)) {
      return;
    }
    const next = stepSharedColBoundary(primarySpan, secondarySpan, direction);
    if (!next) {
      if (direction === 1 && edge === "right" && onTryColGrowPush && onDraftColPush) {
        const push = onTryColGrowPush();
        if (push) {
          usedColPushRef.current = true;
          colPushAccumRef.current = {
            colSpans: { ...colPushAccumRef.current.colSpans, ...push.colSpans },
            anchors: { ...colPushAccumRef.current.anchors, ...push.anchors },
          };
          const pushedSpan = push.colSpans[tileId];
          if (pushedSpan != null) {
            draftSelfRef.current = pushedSpan;
          }
          onDraftColPush(push);
        }
      }
      return;
    }
    usedColPushRef.current = false;
    colPushAccumRef.current = { colSpans: {}, anchors: {} };
    if (edge === "right") {
      draftSelfRef.current = next.left;
      draftNeighborRef.current = next.right;
    } else {
      draftSelfRef.current = next.right;
      draftNeighborRef.current = next.left;
    }
    onDraftBoundary(primaryId, next.left, secondaryId, next.right);
  };

  useEffect(() => {
    if (!gestureActiveRef.current) {
      draftSelfRef.current = span;
      if (neighborSpan != null) {
        draftNeighborRef.current = neighborSpan;
      }
    }
  }, [neighborSpan, span]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    gestureActiveRef.current = true;
    usedColPushRef.current = false;
    colPushAccumRef.current = { colSpans: {}, anchors: {} };
    draftSelfRef.current = span;
    if (neighborSpan != null) {
      draftNeighborRef.current = neighborSpan;
    }
    accumulatedDeltaRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!gestureActiveRef.current) {
      return;
    }
    const delta = event.movementX;
    accumulatedDeltaRef.current += delta;
    while (Math.abs(accumulatedDeltaRef.current) >= RESIZE_STEP_PX) {
      const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
      accumulatedDeltaRef.current -= direction * RESIZE_STEP_PX;
      if (isBoundary) {
        stepDraftBoundary(direction);
      } else {
        stepDraftSolo(direction);
      }
    }
  };

  const finishGesture = (commit: boolean) => {
    if (!gestureActiveRef.current) {
      return;
    }
    gestureActiveRef.current = false;
    accumulatedDeltaRef.current = 0;
    if (commit) {
      if (usedColPushRef.current && onCommitColPush) {
        onCommitColPush(colPushAccumRef.current);
        usedColPushRef.current = false;
        colPushAccumRef.current = { colSpans: {}, anchors: {} };
      } else if (isBoundary && neighborId != null) {
        const { primaryId, secondaryId } = primaryIds();
        const leftSpan = edge === "right" ? draftSelfRef.current : draftNeighborRef.current;
        const rightSpan = edge === "right" ? draftNeighborRef.current : draftSelfRef.current;
        if (isColSpan(leftSpan) && isColSpan(rightSpan)) {
          onCommitBoundary(primaryId, leftSpan, secondaryId, rightSpan);
        }
      } else if (isColSpan(draftSelfRef.current)) {
        onCommitSpan(draftSelfRef.current);
      }
    } else {
      draftSelfRef.current = span;
      if (neighborSpan != null) {
        draftNeighborRef.current = neighborSpan;
      }
      onRevert();
    }
  };

  const handlePointerUp = () => {
    finishGesture(true);
  };

  const handlePointerCancel = () => {
    finishGesture(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const positiveKey = "ArrowRight";
    const negativeKey = "ArrowLeft";

    if (event.key === positiveKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!gestureActiveRef.current) {
        draftSelfRef.current = span;
        if (neighborSpan != null) {
          draftNeighborRef.current = neighborSpan;
        }
      }
      if (isBoundary) {
        stepDraftBoundary(1);
      } else {
        stepDraftSolo(1);
      }
      return;
    }
    if (event.key === negativeKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!gestureActiveRef.current) {
        draftSelfRef.current = span;
        if (neighborSpan != null) {
          draftNeighborRef.current = neighborSpan;
        }
      }
      if (isBoundary) {
        stepDraftBoundary(-1);
      } else {
        stepDraftSolo(-1);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (usedColPushRef.current && onCommitColPush) {
        onCommitColPush(colPushAccumRef.current);
        usedColPushRef.current = false;
        colPushAccumRef.current = { colSpans: {}, anchors: {} };
      } else if (isBoundary && neighborId != null) {
        const { primaryId, secondaryId } = primaryIds();
        const leftSpan = edge === "right" ? draftSelfRef.current : draftNeighborRef.current;
        const rightSpan = edge === "right" ? draftNeighborRef.current : draftSelfRef.current;
        if (isColSpan(leftSpan) && isColSpan(rightSpan)) {
          onCommitBoundary(primaryId, leftSpan, secondaryId, rightSpan);
        }
      } else if (isColSpan(draftSelfRef.current)) {
        onCommitSpan(draftSelfRef.current);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      draftSelfRef.current = span;
      if (neighborSpan != null) {
        draftNeighborRef.current = neighborSpan;
      }
      onRevert();
    }
  };

  const gapOffset = "calc(-1 * var(--dashboard-gap) / 2)";
  const handleThickness = "max(12px, min(16px, var(--dashboard-gap)))";
  const testId =
    edge === "right" ? "dashboard-tile-resize-handle" : "dashboard-tile-resize-handle-left";

  return (
    // biome-ignore lint/a11y/useSemanticElements: resize handle needs pointer capture, not <hr>
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-valuemin={3}
      aria-valuemax={12}
      aria-valuenow={span}
      aria-label="Resize tile width"
      className={cn(
        "absolute z-30 flex opacity-0 transition-opacity",
        "hover:opacity-100 focus-visible:opacity-100 active:opacity-100",
        "top-4 bottom-4 cursor-col-resize touch-none justify-center",
        edge === "left" ? "justify-end" : "justify-start",
      )}
      style={{
        ...(edge === "right" ? { right: gapOffset } : { left: gapOffset }),
        width: handleThickness,
      }}
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={() => {
        finishGesture(true);
      }}
      onKeyDown={handleKeyDown}
    >
      <span
        className="h-full w-0.5 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/70 active:bg-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
};

const DashboardTileRowResizeHandle = ({
  edge,
  tileId,
  span,
  neighborId,
  neighborSpan,
  onDraftSpan,
  onDraftBoundary,
  onCommitSpan,
  onCommitBoundary,
  onRevert,
  canStep,
}: RowResizeHandleProps) => {
  const isBoundary = neighborId != null && neighborSpan != null;
  const draftSelfRef = useRef<RowSpan>(span);
  const draftNeighborRef = useRef<RowSpan>(neighborSpan ?? span);
  const accumulatedDeltaRef = useRef(0);
  const gestureActiveRef = useRef(false);

  const primaryIds = (): {
    primaryId: DashboardTileId;
    secondaryId: DashboardTileId;
  } => {
    if (!isBoundary || neighborId == null) {
      return { primaryId: tileId, secondaryId: tileId };
    }
    if (edge === "bottom") {
      return { primaryId: tileId, secondaryId: neighborId };
    }
    return { primaryId: neighborId, secondaryId: tileId };
  };

  const stepDraftSolo = (direction: 1 | -1) => {
    const flipped = direction === 1 ? -1 : 1;
    const stepDirection = edge === "top" ? flipped : direction;
    const current = draftSelfRef.current;
    if (!isRowSpan(current, tileId)) {
      return;
    }
    const next = stepRowSpan(current, stepDirection, tileId);
    if (next === current) {
      return;
    }
    if (canStep && !canStep(direction)) {
      return;
    }
    draftSelfRef.current = next;
    onDraftSpan(next);
  };

  const stepDraftBoundary = (direction: 1 | -1) => {
    if (!isBoundary || neighborId == null) {
      return;
    }
    const { primaryId, secondaryId } = primaryIds();
    const primarySpan = edge === "bottom" ? draftSelfRef.current : draftNeighborRef.current;
    const secondarySpan = edge === "bottom" ? draftNeighborRef.current : draftSelfRef.current;
    if (!isRowSpan(primarySpan, tileId) || !isRowSpan(secondarySpan, tileId)) {
      return;
    }
    const next = stepSharedRowBoundary(
      primarySpan,
      secondarySpan,
      direction,
      primaryId,
      secondaryId,
    );
    if (!next) {
      if (edge === "bottom" && direction === 1) {
        stepDraftSolo(1);
      }
      return;
    }
    if (edge === "bottom") {
      draftSelfRef.current = next.top;
      draftNeighborRef.current = next.bottom;
    } else {
      draftSelfRef.current = next.bottom;
      draftNeighborRef.current = next.top;
    }
    onDraftBoundary(primaryId, next.top, secondaryId, next.bottom);
  };

  useEffect(() => {
    if (!gestureActiveRef.current) {
      draftSelfRef.current = span;
      if (neighborSpan != null) {
        draftNeighborRef.current = neighborSpan;
      }
    }
  }, [neighborSpan, span]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    gestureActiveRef.current = true;
    draftSelfRef.current = span;
    if (neighborSpan != null) {
      draftNeighborRef.current = neighborSpan;
    }
    accumulatedDeltaRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!gestureActiveRef.current) {
      return;
    }
    accumulatedDeltaRef.current += event.movementY;
    while (Math.abs(accumulatedDeltaRef.current) >= RESIZE_STEP_PX) {
      const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
      accumulatedDeltaRef.current -= direction * RESIZE_STEP_PX;
      if (isBoundary) {
        stepDraftBoundary(direction);
      } else {
        stepDraftSolo(direction);
      }
    }
  };

  const finishGesture = (commit: boolean) => {
    if (!gestureActiveRef.current) {
      return;
    }
    gestureActiveRef.current = false;
    accumulatedDeltaRef.current = 0;
    if (commit) {
      if (isBoundary && neighborId != null) {
        const { primaryId, secondaryId } = primaryIds();
        const topSpan = edge === "bottom" ? draftSelfRef.current : draftNeighborRef.current;
        const bottomSpan = edge === "bottom" ? draftNeighborRef.current : draftSelfRef.current;
        if (isRowSpan(topSpan, tileId) && isRowSpan(bottomSpan, tileId)) {
          onCommitBoundary(primaryId, topSpan, secondaryId, bottomSpan);
        }
      } else if (isRowSpan(draftSelfRef.current, tileId)) {
        onCommitSpan(draftSelfRef.current);
      }
    } else {
      draftSelfRef.current = span;
      if (neighborSpan != null) {
        draftNeighborRef.current = neighborSpan;
      }
      onRevert();
    }
  };

  const handlePointerUp = () => {
    finishGesture(true);
  };

  const handlePointerCancel = () => {
    finishGesture(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      if (!gestureActiveRef.current) {
        draftSelfRef.current = span;
        if (neighborSpan != null) {
          draftNeighborRef.current = neighborSpan;
        }
      }
      if (isBoundary) {
        stepDraftBoundary(1);
      } else {
        stepDraftSolo(1);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (!gestureActiveRef.current) {
        draftSelfRef.current = span;
        if (neighborSpan != null) {
          draftNeighborRef.current = neighborSpan;
        }
      }
      if (isBoundary) {
        stepDraftBoundary(-1);
      } else {
        stepDraftSolo(-1);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (isBoundary && neighborId != null) {
        const { primaryId, secondaryId } = primaryIds();
        const topSpan = edge === "bottom" ? draftSelfRef.current : draftNeighborRef.current;
        const bottomSpan = edge === "bottom" ? draftNeighborRef.current : draftSelfRef.current;
        if (isRowSpan(topSpan, tileId) && isRowSpan(bottomSpan, tileId)) {
          onCommitBoundary(primaryId, topSpan, secondaryId, bottomSpan);
        }
      } else if (isRowSpan(draftSelfRef.current, tileId)) {
        onCommitSpan(draftSelfRef.current);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      draftSelfRef.current = span;
      if (neighborSpan != null) {
        draftNeighborRef.current = neighborSpan;
      }
      onRevert();
    }
  };

  const gapOffset = "calc(-1 * var(--dashboard-gap) / 2)";
  const handleThickness = "max(12px, min(16px, var(--dashboard-gap)))";
  const testId =
    edge === "bottom" ? "dashboard-tile-resize-handle-bottom" : "dashboard-tile-resize-handle-top";
  const ariaMax = tileId === "history" ? 12 : 6;

  return (
    // biome-ignore lint/a11y/useSemanticElements: resize handle needs pointer capture, not <hr>
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-valuemin={2}
      aria-valuemax={ariaMax}
      aria-valuenow={span}
      aria-label="Resize tile height"
      className={cn(
        "absolute z-30 flex opacity-0 transition-opacity",
        "hover:opacity-100 focus-visible:opacity-100 active:opacity-100",
        "right-4 left-4 cursor-row-resize touch-none flex-col items-center",
        edge === "top" ? "justify-end" : "justify-start",
      )}
      style={{
        ...(edge === "bottom" ? { bottom: gapOffset } : { top: gapOffset }),
        height: handleThickness,
      }}
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={() => {
        finishGesture(true);
      }}
      onKeyDown={handleKeyDown}
    >
      <span
        className="h-0.5 w-full rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/70 active:bg-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
};
