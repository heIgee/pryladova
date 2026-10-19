import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { DashboardTileResizeHandle } from "@/components/layout/dashboard-tile-resize-handle";
import { DashboardTileShellProvider } from "@/components/layout/dashboard-tile-shell-context";
import { BentoTileSizeProvider } from "@/hooks/use-bento-tile-size";
import type {
  ColGrowPushResult,
  ColSpan,
  DashboardTileId,
  ResizeHandleEdges,
  RowSpan,
  TilePlacement,
} from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

export const DashboardTileShell = ({
  id,
  placement,
  effectiveColSpan,
  effectiveRowSpan,
  resizeHandles,
  leftNeighborId,
  rightNeighborId,
  topNeighborId,
  bottomNeighborId,
  leftNeighborColSpan,
  rightNeighborColSpan,
  topNeighborRowSpan,
  bottomNeighborRowSpan,
  isOverlay = false,
  isDragSource = false,
  onDraftColSpan,
  onDraftColBoundary,
  onCommitColSpan,
  onCommitColBoundary,
  onDraftRowSpan,
  onDraftRowBoundary,
  onCommitRowSpan,
  onCommitRowBoundary,
  onRevertSpans,
  onTryColGrowPush,
  onDraftColPush,
  onCommitColPush,
  canStepBottomRowSpan,
  canStepTopRowSpan,
  children,
}: {
  id: DashboardTileId;
  placement: TilePlacement;
  effectiveColSpan: ColSpan;
  effectiveRowSpan: RowSpan;
  resizeHandles: ResizeHandleEdges;
  leftNeighborId?: DashboardTileId | null;
  rightNeighborId?: DashboardTileId | null;
  topNeighborId?: DashboardTileId | null;
  bottomNeighborId?: DashboardTileId | null;
  leftNeighborColSpan?: ColSpan;
  rightNeighborColSpan?: ColSpan;
  topNeighborRowSpan?: RowSpan;
  bottomNeighborRowSpan?: RowSpan;
  isOverlay?: boolean;
  isDragSource?: boolean;
  onDraftColSpan: (span: ColSpan) => void;
  onDraftColBoundary: (
    leftId: DashboardTileId,
    leftSpan: ColSpan,
    rightId: DashboardTileId,
    rightSpan: ColSpan,
  ) => void;
  onCommitColSpan: (span: ColSpan) => void;
  onCommitColBoundary: (
    leftId: DashboardTileId,
    leftSpan: ColSpan,
    rightId: DashboardTileId,
    rightSpan: ColSpan,
  ) => void;
  onDraftRowSpan: (span: RowSpan) => void;
  onDraftRowBoundary: (
    topId: DashboardTileId,
    topSpan: RowSpan,
    bottomId: DashboardTileId,
    bottomSpan: RowSpan,
  ) => void;
  onCommitRowSpan: (span: RowSpan) => void;
  onCommitRowBoundary: (
    topId: DashboardTileId,
    topSpan: RowSpan,
    bottomId: DashboardTileId,
    bottomSpan: RowSpan,
  ) => void;
  onRevertSpans: () => void;
  onTryColGrowPush?: () => ColGrowPushResult | null;
  onDraftColPush?: (result: ColGrowPushResult) => void;
  onCommitColPush?: (result: ColGrowPushResult) => void;
  canStepBottomRowSpan?: (direction: 1 | -1) => boolean;
  canStepTopRowSpan?: (direction: 1 | -1) => boolean;
  children: ReactNode;
}) => {
  const draggable = useDraggable({ id, disabled: isOverlay });
  const droppable = useDroppable({ id, disabled: isOverlay || isDragSource });
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = draggable;
  const { isOver } = droppable;
  const showColHandles = !isOverlay && (resizeHandles.left || resizeHandles.right);
  const showRowHandles = !isOverlay && (resizeHandles.top || resizeHandles.bottom);

  const setShellRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    droppable.setNodeRef(node);
  };

  return (
    <DashboardTileShellProvider
      value={{
        dragListeners: isOverlay ? null : (listeners ?? null),
        dragAttributes: isOverlay ? null : attributes,
        setDragActivatorRef: isOverlay ? null : setActivatorNodeRef,
        isDragging: isOverlay || isDragging,
        isDropTarget: !isOverlay && isOver,
      }}
    >
      <div
        ref={isOverlay ? undefined : setShellRef}
        style={
          isOverlay
            ? undefined
            : {
                gridColumn: `${placement.startCol} / span ${effectiveColSpan}`,
                gridRow: `${placement.startRow} / span ${effectiveRowSpan}`,
              }
        }
        className={cn(
          "group/shell relative z-0 h-full min-h-0 min-w-0 hover:z-10 focus-within:z-10",
          isDragSource && "pointer-events-none invisible",
          isOver && !isDragSource && "z-20 ring-2 ring-primary/40 ring-inset",
        )}
        data-testid={`dashboard-tile-shell-${id}`}
        data-col-span={effectiveColSpan}
        data-row-span={effectiveRowSpan}
        data-grid-row={placement.startRow}
        data-grid-col={placement.startCol}
      >
        {showColHandles && resizeHandles.right ? (
          <DashboardTileResizeHandle
            axis="x"
            edge="right"
            tileId={id}
            span={effectiveColSpan}
            neighborId={rightNeighborId}
            neighborSpan={rightNeighborColSpan}
            onDraftSpan={(span) => onDraftColSpan(span as ColSpan)}
            onDraftBoundary={(leftId, leftSpan, rightId, rightSpan) =>
              onDraftColBoundary(leftId, leftSpan as ColSpan, rightId, rightSpan as ColSpan)
            }
            onCommitSpan={(span) => onCommitColSpan(span as ColSpan)}
            onCommitBoundary={(leftId, leftSpan, rightId, rightSpan) =>
              onCommitColBoundary(leftId, leftSpan as ColSpan, rightId, rightSpan as ColSpan)
            }
            onRevert={onRevertSpans}
            onTryColGrowPush={onTryColGrowPush}
            onDraftColPush={onDraftColPush}
            onCommitColPush={onCommitColPush}
          />
        ) : null}
        {showColHandles && resizeHandles.left ? (
          <DashboardTileResizeHandle
            axis="x"
            edge="left"
            tileId={id}
            span={effectiveColSpan}
            neighborId={leftNeighborId}
            neighborSpan={leftNeighborColSpan}
            onDraftSpan={(span) => onDraftColSpan(span as ColSpan)}
            onDraftBoundary={(leftId, leftSpan, rightId, rightSpan) =>
              onDraftColBoundary(leftId, leftSpan as ColSpan, rightId, rightSpan as ColSpan)
            }
            onCommitSpan={(span) => onCommitColSpan(span as ColSpan)}
            onCommitBoundary={(leftId, leftSpan, rightId, rightSpan) =>
              onCommitColBoundary(leftId, leftSpan as ColSpan, rightId, rightSpan as ColSpan)
            }
            onRevert={onRevertSpans}
          />
        ) : null}
        {showRowHandles && resizeHandles.bottom ? (
          <DashboardTileResizeHandle
            axis="y"
            edge="bottom"
            tileId={id}
            span={effectiveRowSpan}
            neighborId={bottomNeighborId}
            neighborSpan={bottomNeighborRowSpan}
            onDraftSpan={(span) => onDraftRowSpan(span as RowSpan)}
            onDraftBoundary={(topId, topSpan, bottomId, bottomSpan) =>
              onDraftRowBoundary(topId, topSpan as RowSpan, bottomId, bottomSpan as RowSpan)
            }
            onCommitSpan={(span) => onCommitRowSpan(span as RowSpan)}
            onCommitBoundary={(topId, topSpan, bottomId, bottomSpan) =>
              onCommitRowBoundary(topId, topSpan as RowSpan, bottomId, bottomSpan as RowSpan)
            }
            onRevert={onRevertSpans}
            canStep={canStepBottomRowSpan}
          />
        ) : null}
        {showRowHandles && resizeHandles.top ? (
          <DashboardTileResizeHandle
            axis="y"
            edge="top"
            tileId={id}
            span={effectiveRowSpan}
            neighborId={topNeighborId}
            neighborSpan={topNeighborRowSpan}
            onDraftSpan={(span) => onDraftRowSpan(span as RowSpan)}
            onDraftBoundary={(topId, topSpan, bottomId, bottomSpan) =>
              onDraftRowBoundary(topId, topSpan as RowSpan, bottomId, bottomSpan as RowSpan)
            }
            onCommitSpan={(span) => onCommitRowSpan(span as RowSpan)}
            onCommitBoundary={(topId, topSpan, bottomId, bottomSpan) =>
              onCommitRowBoundary(topId, topSpan as RowSpan, bottomId, bottomSpan as RowSpan)
            }
            onRevert={onRevertSpans}
            canStep={canStepTopRowSpan}
          />
        ) : null}
        <BentoTileSizeProvider value={{ colSpan: effectiveColSpan, rowSpan: effectiveRowSpan }}>
          {children}
        </BentoTileSizeProvider>
      </div>
    </DashboardTileShellProvider>
  );
};
