import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef } from "react";
import {
  type ColGrowPushResult,
  type ColSpan,
  type DashboardTileId,
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

export const DashboardTileResizeHandle = ({
  axis,
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
  onTryColGrowPush,
  onDraftColPush,
  onCommitColPush,
}: {
  axis: "x" | "y";
  edge: "left" | "right" | "top" | "bottom";
  tileId: DashboardTileId;
  span: ColSpan | RowSpan;
  neighborId?: DashboardTileId | null;
  neighborSpan?: ColSpan | RowSpan;
  onDraftSpan: (span: ColSpan | RowSpan) => void;
  onDraftBoundary: (
    ...args: [DashboardTileId, ColSpan | RowSpan, DashboardTileId, ColSpan | RowSpan]
  ) => void;
  onCommitSpan: (span: ColSpan | RowSpan) => void;
  onCommitBoundary: (
    ...args: [DashboardTileId, ColSpan | RowSpan, DashboardTileId, ColSpan | RowSpan]
  ) => void;
  onRevert: () => void;
  canStep?: (direction: 1 | -1) => boolean;
  onTryColGrowPush?: () => ColGrowPushResult | null;
  onDraftColPush?: (result: ColGrowPushResult) => void;
  onCommitColPush?: (result: ColGrowPushResult) => void;
}) => {
  const isBoundary = neighborId != null && neighborSpan != null;
  const draftSelfRef = useRef(span);
  const draftNeighborRef = useRef(neighborSpan ?? span);
  const accumulatedDeltaRef = useRef(0);
  const gestureActiveRef = useRef(false);
  const usedColPushRef = useRef(false);
  const colPushAccumRef = useRef<ColGrowPushResult>({ colSpans: {}, anchors: {} });

  const primaryIds = useCallback((): {
    primaryId: DashboardTileId;
    secondaryId: DashboardTileId;
  } => {
    if (!isBoundary || neighborId == null) {
      return { primaryId: tileId, secondaryId: tileId };
    }
    if (axis === "x") {
      if (edge === "right") {
        return { primaryId: tileId, secondaryId: neighborId };
      }
      return { primaryId: neighborId, secondaryId: tileId };
    }
    if (edge === "bottom") {
      return { primaryId: tileId, secondaryId: neighborId };
    }
    return { primaryId: neighborId, secondaryId: tileId };
  }, [axis, edge, isBoundary, neighborId, tileId]);

  const stepDraftSolo = useCallback(
    (direction: 1 | -1) => {
      const stepDirection =
        edge === "left" || edge === "top" ? (direction === 1 ? -1 : 1) : direction;
      if (axis === "x") {
        const current = draftSelfRef.current as ColSpan;
        const next = stepColSpan(current, stepDirection);
        if (next === current) {
          return;
        }
        draftSelfRef.current = next;
        (onDraftSpan as ColResizeProps["onDraftSpan"])(next);
        return;
      }
      const current = draftSelfRef.current as RowSpan;
      const next = stepRowSpan(current, stepDirection, tileId);
      if (next === current) {
        return;
      }
      if (canStep && !canStep(direction)) {
        return;
      }
      draftSelfRef.current = next;
      (onDraftSpan as RowResizeProps["onDraftSpan"])(next);
    },
    [axis, edge, canStep, onDraftSpan, tileId],
  );

  const stepDraftBoundary = useCallback(
    (direction: 1 | -1) => {
      if (!isBoundary || neighborId == null) {
        return;
      }
      const { primaryId, secondaryId } = primaryIds();

      if (axis === "x") {
        const primarySpan =
          edge === "right"
            ? (draftSelfRef.current as ColSpan)
            : (draftNeighborRef.current as ColSpan);
        const secondarySpan =
          edge === "right"
            ? (draftNeighborRef.current as ColSpan)
            : (draftSelfRef.current as ColSpan);
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
        (onDraftBoundary as ColResizeProps["onDraftBoundary"])(
          primaryId,
          next.left,
          secondaryId,
          next.right,
        );
        return;
      }

      const primarySpan =
        edge === "bottom"
          ? (draftSelfRef.current as RowSpan)
          : (draftNeighborRef.current as RowSpan);
      const secondarySpan =
        edge === "bottom"
          ? (draftNeighborRef.current as RowSpan)
          : (draftSelfRef.current as RowSpan);
      const next = stepSharedRowBoundary(
        primarySpan,
        secondarySpan,
        direction,
        primaryId,
        secondaryId,
      );
      if (!next) {
        if (axis === "y" && edge === "bottom" && direction === 1) {
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
      (onDraftBoundary as RowResizeProps["onDraftBoundary"])(
        primaryId,
        next.top,
        secondaryId,
        next.bottom,
      );
    },
    [
      axis,
      edge,
      isBoundary,
      neighborId,
      onDraftBoundary,
      onDraftColPush,
      onTryColGrowPush,
      primaryIds,
      stepDraftSolo,
      tileId,
    ],
  );

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
    const delta = axis === "x" ? event.movementX : event.movementY;
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
        if (axis === "x") {
          const leftSpan =
            edge === "right"
              ? (draftSelfRef.current as ColSpan)
              : (draftNeighborRef.current as ColSpan);
          const rightSpan =
            edge === "right"
              ? (draftNeighborRef.current as ColSpan)
              : (draftSelfRef.current as ColSpan);
          (onCommitBoundary as ColResizeProps["onCommitBoundary"])(
            primaryId,
            leftSpan,
            secondaryId,
            rightSpan,
          );
        } else {
          const topSpan =
            edge === "bottom"
              ? (draftSelfRef.current as RowSpan)
              : (draftNeighborRef.current as RowSpan);
          const bottomSpan =
            edge === "bottom"
              ? (draftNeighborRef.current as RowSpan)
              : (draftSelfRef.current as RowSpan);
          (onCommitBoundary as RowResizeProps["onCommitBoundary"])(
            primaryId,
            topSpan,
            secondaryId,
            bottomSpan,
          );
        }
      } else {
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
    const positiveKey = axis === "x" ? "ArrowRight" : "ArrowDown";
    const negativeKey = axis === "x" ? "ArrowLeft" : "ArrowUp";

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
        if (axis === "x") {
          const leftSpan =
            edge === "right"
              ? (draftSelfRef.current as ColSpan)
              : (draftNeighborRef.current as ColSpan);
          const rightSpan =
            edge === "right"
              ? (draftNeighborRef.current as ColSpan)
              : (draftSelfRef.current as ColSpan);
          (onCommitBoundary as ColResizeProps["onCommitBoundary"])(
            primaryId,
            leftSpan,
            secondaryId,
            rightSpan,
          );
        } else {
          const topSpan =
            edge === "bottom"
              ? (draftSelfRef.current as RowSpan)
              : (draftNeighborRef.current as RowSpan);
          const bottomSpan =
            edge === "bottom"
              ? (draftNeighborRef.current as RowSpan)
              : (draftSelfRef.current as RowSpan);
          (onCommitBoundary as RowResizeProps["onCommitBoundary"])(
            primaryId,
            topSpan,
            secondaryId,
            bottomSpan,
          );
        }
      } else {
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
  const isVertical = axis === "x";
  const ariaOrientation = isVertical ? "vertical" : "horizontal";
  const ariaMin = axis === "x" ? 3 : 2;
  const ariaMax = axis === "x" ? 12 : tileId === "history" ? 12 : 6;
  const resizeLabel = axis === "x" ? "Resize tile width" : "Resize tile height";

  const testId =
    edge === "right"
      ? "dashboard-tile-resize-handle"
      : edge === "left"
        ? "dashboard-tile-resize-handle-left"
        : edge === "bottom"
          ? "dashboard-tile-resize-handle-bottom"
          : "dashboard-tile-resize-handle-top";

  return (
    // biome-ignore lint/a11y/useSemanticElements: resize handle needs pointer capture, not <hr>
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={ariaOrientation}
      aria-valuemin={ariaMin}
      aria-valuemax={ariaMax}
      aria-valuenow={span}
      aria-label={resizeLabel}
      className={cn(
        "absolute z-30 flex opacity-0 transition-opacity",
        "focus-visible:opacity-100 hover:opacity-100 active:opacity-100",
        isVertical
          ? "top-4 bottom-4 justify-center cursor-col-resize touch-none"
          : "left-4 right-4 flex-col items-center cursor-row-resize touch-none",
        edge === "top" || edge === "left" ? "justify-end" : "justify-start",
      )}
      style={
        isVertical
          ? {
              ...(edge === "right" ? { right: gapOffset } : { left: gapOffset }),
              width: handleThickness,
            }
          : {
              ...(edge === "bottom" ? { bottom: gapOffset } : { top: gapOffset }),
              height: handleThickness,
            }
      }
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
        className={cn(
          "rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/70 active:bg-muted-foreground",
          isVertical ? "h-full w-0.5" : "h-0.5 w-full",
        )}
        aria-hidden="true"
      />
    </div>
  );
};
