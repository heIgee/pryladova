import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { type ReactNode, useCallback, useState } from "react";
import { DashboardRowBandResizeHandle } from "@/components/layout/dashboard-row-band-resize-handle";
import {
  type ColSpan,
  DASHBOARD_ROW_HEIGHT,
  type DashboardTileId,
  DEFAULT_GAP,
  type FreeDropSlot,
  listFreeDropSlots,
  parseFreeDropSlotId,
  type RowBand,
  type RowSpan,
  rowBandBoundaryTopPx,
  type TileAnchor,
  type TilePlacement,
} from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

const FreeDropFrame = ({ slot }: { slot: FreeDropSlot }) => {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `${slot.startCol} / span ${slot.hitColSpan}`,
        gridRow: `${slot.startRow} / span ${slot.hitRowSpan}`,
      }}
      className="relative z-10 h-full min-h-0 min-w-0"
      data-testid={`dashboard-free-drop-${slot.startRow}-${slot.startCol}`}
      data-over={isOver ? "true" : "false"}
    >
      <div
        className={cn(
          "absolute top-0 left-0",
          isOver && "z-20 bg-primary/5 ring-2 ring-primary/40 ring-inset",
        )}
        style={{
          width: `${(slot.colSpan / slot.hitColSpan) * 100}%`,
          height: `${(slot.rowSpan / slot.hitRowSpan) * 100}%`,
        }}
      />
    </div>
  );
};

export const DashboardGrid = ({
  visibleTileIds,
  placements,
  resolveColSpan,
  resolveRowSpan,
  renderTile,
  onSwapTiles,
  onPlaceTile,
  rowBandResize,
}: {
  visibleTileIds: DashboardTileId[];
  placements: TilePlacement[];
  resolveColSpan: (id: DashboardTileId) => ColSpan;
  resolveRowSpan: (id: DashboardTileId) => RowSpan;
  renderTile: (id: DashboardTileId, overlay?: boolean, isDragSource?: boolean) => ReactNode;
  onSwapTiles: (activeId: DashboardTileId, overId: DashboardTileId) => void;
  onPlaceTile: (activeId: DashboardTileId, anchor: TileAnchor) => void;
  rowBandResize?: {
    bands: RowBand[];
    stepBand: (
      band: RowBand,
      direction: 1 | -1,
    ) => Partial<Record<DashboardTileId, RowSpan>> | null;
    onDraftBand: (overrides: Partial<Record<DashboardTileId, RowSpan>>) => void;
    onCommitBand: (overrides: Partial<Record<DashboardTileId, RowSpan>>) => void;
    onRevert: () => void;
  };
}) => {
  const [activeId, setActiveId] = useState<DashboardTileId | null>(null);
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const isDragging = activeId != null;
  const freeDropSlots =
    activeId == null
      ? []
      : listFreeDropSlots(placements, activeId, resolveColSpan(activeId), resolveRowSpan(activeId));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as DashboardTileId;
    setActiveId(id);
    const shell = document.querySelector(`[data-testid="dashboard-tile-shell-${id}"]`);
    const bounds = shell?.getBoundingClientRect();
    setOverlaySize(bounds ? { width: bounds.width, height: bounds.height } : null);
  }, []);

  const clearDrag = useCallback(() => {
    setActiveId(null);
    setOverlaySize(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const slot = over ? parseFreeDropSlotId(over.id) : null;
      if (slot) {
        onPlaceTile(active.id as DashboardTileId, slot);
      } else if (over && active.id !== over.id) {
        onSwapTiles(active.id as DashboardTileId, over.id as DashboardTileId);
      }
      clearDrag();
    },
    [clearDrag, onPlaceTile, onSwapTiles],
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      clearDrag();
    },
    [clearDrag],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="relative">
        <div
          className="grid grid-cols-12"
          style={{
            gap: `${DEFAULT_GAP}px`,
            ["--dashboard-gap" as string]: `${DEFAULT_GAP}px`,
            ["--dashboard-row-height" as string]: `${DASHBOARD_ROW_HEIGHT}px`,
            gridAutoRows: "var(--dashboard-row-height)",
          }}
          data-testid="dashboard-grid"
        >
          {visibleTileIds.map((id) => renderTile(id, false, isDragging && id === activeId))}
          {freeDropSlots.map((slot) => (
            <FreeDropFrame key={slot.id} slot={slot} />
          ))}
        </div>
        {rowBandResize && !isDragging
          ? rowBandResize.bands.map((band) => (
              <DashboardRowBandResizeHandle
                key={band.startRow}
                band={band}
                topPx={rowBandBoundaryTopPx(band.endRow, DEFAULT_GAP)}
                stepBand={(direction) => rowBandResize.stepBand(band, direction)}
                onDraftBand={rowBandResize.onDraftBand}
                onCommitBand={rowBandResize.onCommitBand}
                onRevert={rowBandResize.onRevert}
              />
            ))
          : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div
            className="min-w-0"
            style={
              overlaySize != null
                ? { width: `${overlaySize.width}px`, height: `${overlaySize.height}px` }
                : undefined
            }
            data-testid={`dashboard-tile-overlay-${activeId}`}
          >
            {renderTile(activeId, true)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
