import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { createContext, useContext } from "react";

export type DashboardTileDragListeners = DraggableSyntheticListeners;

export type DashboardTileShellContextValue = {
  dragListeners: DashboardTileDragListeners | null;
  dragAttributes: DraggableAttributes | null;
  setDragActivatorRef: ((element: HTMLElement | null) => void) | null;
  isDragging: boolean;
  isDropTarget: boolean;
};

const DashboardTileShellContext = createContext<DashboardTileShellContextValue>({
  dragListeners: null,
  dragAttributes: null,
  setDragActivatorRef: null,
  isDragging: false,
  isDropTarget: false,
});

export const DashboardTileShellProvider = DashboardTileShellContext.Provider;

export const useDashboardTileShellContext = (): DashboardTileShellContextValue =>
  useContext(DashboardTileShellContext);

export const useDashboardTileDragHandle = (): DashboardTileDragListeners | null =>
  useContext(DashboardTileShellContext).dragListeners;
