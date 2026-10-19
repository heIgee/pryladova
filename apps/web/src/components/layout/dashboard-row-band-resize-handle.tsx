import { type KeyboardEvent, type PointerEvent, useCallback, useRef } from "react";
import type { DashboardTileId, RowBand, RowSpan } from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

/** Drag distance before snapping one row-span step. */
const RESIZE_STEP_PX = 56;

export const DashboardRowBandResizeHandle = ({
  band,
  topPx,
  stepBand,
  onDraftBand,
  onCommitBand,
  onRevert,
}: {
  band: RowBand;
  topPx: number;
  stepBand: (direction: 1 | -1) => Partial<Record<DashboardTileId, RowSpan>> | null;
  onDraftBand: (overrides: Partial<Record<DashboardTileId, RowSpan>>) => void;
  onCommitBand: (overrides: Partial<Record<DashboardTileId, RowSpan>>) => void;
  onRevert: () => void;
}) => {
  const accumulatedDeltaRef = useRef(0);
  const gestureActiveRef = useRef(false);
  const draftOverridesRef = useRef<Partial<Record<DashboardTileId, RowSpan>> | null>(null);

  const applyStep = useCallback(
    (direction: 1 | -1) => {
      const overrides = stepBand(direction);
      if (!overrides) {
        return;
      }
      draftOverridesRef.current = overrides;
      onDraftBand(overrides);
    },
    [onDraftBand, stepBand],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    gestureActiveRef.current = true;
    draftOverridesRef.current = null;
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
      applyStep(direction);
    }
  };

  const finishGesture = (commit: boolean) => {
    if (!gestureActiveRef.current) {
      return;
    }
    gestureActiveRef.current = false;
    accumulatedDeltaRef.current = 0;
    if (commit && draftOverridesRef.current) {
      onCommitBand(draftOverridesRef.current);
    } else {
      draftOverridesRef.current = null;
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
      applyStep(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      applyStep(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (draftOverridesRef.current) {
        onCommitBand(draftOverridesRef.current);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      draftOverridesRef.current = null;
      onRevert();
    }
  };

  const handleThickness = "max(12px, min(16px, var(--dashboard-gap)))";

  return (
    // biome-ignore lint/a11y/useSemanticElements: row band resize needs pointer capture
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-valuemin={1}
      aria-valuemax={band.tileIds.every((id) => id === "history") ? 12 : 6}
      aria-valuenow={band.endRow - band.startRow + 1}
      aria-label="Resize row height"
      className={cn(
        "absolute left-0 right-0 z-20 flex items-center justify-center opacity-0 transition-opacity",
        "focus-visible:opacity-100 hover:opacity-100 active:opacity-100",
        "cursor-row-resize touch-none",
      )}
      style={{
        top: `${topPx}px`,
        height: handleThickness,
        transform: "translateY(-50%)",
      }}
      data-testid={`dashboard-row-band-handle-${band.startRow}`}
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
        className="h-0.5 w-full max-w-none rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 active:bg-muted-foreground/70"
        aria-hidden="true"
      />
    </div>
  );
};
