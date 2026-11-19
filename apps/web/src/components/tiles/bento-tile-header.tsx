import type { ReactNode } from "react";
import {
  bentoTileHeaderClassName,
  bentoTileHeaderRowClassName,
} from "@/components/tiles/bento-tile-header-layout";
import {
  useDashboardTileDragHandle,
  useDashboardTileShellContext,
} from "@/components/tiles/dashboard-tile-shell-context";
import { CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type BentoTileHeaderProps = {
  icon: ReactNode;
  title: string;
  /** `undefined` omits the slot. `null` keeps it and hides the text until the value is ready. */
  detail?: string | null;
  action?: ReactNode;
  /** Buttons placed on either side of the title. The drag handle becomes a div so they are not nested in a button. */
  aroundTitle?: {
    leading: ReactNode;
    trailing: ReactNode;
  };
  titleTestId?: string;
  className?: string;
  testId?: string;
};

export const BentoTileHeader = ({
  icon,
  title,
  detail,
  action,
  aroundTitle,
  titleTestId,
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
  const iconNode = (
    <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
      {icon}
    </span>
  );
  const titleNode = aroundTitle ? (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {aroundTitle.leading}
      <span className="shrink-0 text-sm font-medium" data-testid={titleTestId}>
        {title}
      </span>
      {aroundTitle.trailing}
    </span>
  ) : (
    <span className="shrink-0 text-sm font-medium" data-testid={titleTestId}>
      {title}
    </span>
  );
  const detailNode =
    detail === undefined ? null : (
      <>
        <span
          className={cn(
            "shrink-0 text-micro text-muted-foreground",
            detail === null && "invisible",
          )}
          aria-hidden="true"
        >
          ·
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-micro text-muted-foreground",
            detail === null && "invisible",
          )}
        >
          {detail ?? "\u00a0"}
        </span>
      </>
    );
  const handleLabel = (
    <>
      {iconNode}
      {titleNode}
      {detailNode}
    </>
  );
  let dragHandle: ReactNode = <div className={handleClassName}>{handleLabel}</div>;
  if (dragAttributes && aroundTitle) {
    dragHandle = (
      // Div, not button: the day chevrons are buttons and cannot nest inside the drag control.
      // biome-ignore lint/a11y/useSemanticElements: day chevrons cannot nest in a button
      <div
        ref={setDragActivatorRef ?? undefined}
        className={cn(handleClassName, "text-left text-inherit")}
        {...dragAttributes}
        {...(dragListeners ?? {})}
        role="button"
        tabIndex={0}
        aria-label={`Drag ${title}`}
        data-testid="dashboard-tile-drag-handle"
      >
        {handleLabel}
      </div>
    );
  } else if (dragAttributes) {
    dragHandle = (
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
    );
  }

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
        {dragHandle}
        <span className="ml-auto flex h-5 shrink-0 items-center gap-1.5">{action}</span>
      </div>
    </CardHeader>
  );
};
