import type { ReactNode } from "react";
import {
  useDashboardTileDragHandle,
  useDashboardTileShellContext,
} from "@/components/layout/dashboard-tile-shell-context";
import {
  bentoTileHeaderClassName,
  bentoTileHeaderRowClassName,
} from "@/components/tiles/bento-tile-header-layout";
import { CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export {
  bentoTileHeaderClassName,
  bentoTileHeaderRowClassName,
} from "@/components/tiles/bento-tile-header-layout";

export type BentoTileHeaderProps = {
  icon: ReactNode;
  title: string;
  detail?: string | null;
  action?: ReactNode;
  className?: string;
  testId?: string;
};

export const BentoTileHeader = ({
  icon,
  title,
  detail,
  action,
  className,
  testId = "bento-tile-header",
}: BentoTileHeaderProps) => {
  const dragListeners = useDashboardTileDragHandle();
  const { dragAttributes, isDragging, isDropTarget, setDragActivatorRef } =
    useDashboardTileShellContext();
  const handleClassName = cn(
    "flex min-w-0 flex-1 items-center gap-1.5",
    dragListeners ? "cursor-grab active:cursor-grabbing" : null,
  );
  const handleLabel = (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
        {icon}
      </span>
      <span className="shrink-0 text-sm font-medium">{title}</span>
      {detail ? (
        <>
          <span className="shrink-0 text-micro text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="min-w-0 truncate text-micro text-muted-foreground">{detail}</span>
        </>
      ) : null}
    </>
  );

  return (
    <CardHeader
      className={cn(
        bentoTileHeaderClassName,
        className,
        dragListeners
          ? "touch-none [&:has(button:active)]:cursor-default [&:has(button:active)]:hover:bg-transparent"
          : null,
        isDragging ? "bg-muted" : null,
        dragListeners && !isDragging ? "hover:bg-muted/50" : null,
        isDropTarget ? "bg-primary/5" : null,
      )}
      data-testid={testId}
    >
      <div className={bentoTileHeaderRowClassName}>
        {dragAttributes ? (
          <button
            type="button"
            ref={setDragActivatorRef ?? undefined}
            className={cn(handleClassName, "border-0 bg-transparent p-0 text-left text-inherit")}
            {...dragAttributes}
            {...(dragListeners ?? {})}
            aria-label={`Drag ${title}`}
            data-testid="dashboard-tile-drag-handle"
          >
            {handleLabel}
          </button>
        ) : (
          <div className={handleClassName}>{handleLabel}</div>
        )}
        <span className="ml-auto flex h-5 shrink-0 items-center gap-1.5">{action}</span>
      </div>
    </CardHeader>
  );
};
