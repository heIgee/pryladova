import type { ReactNode } from "react";
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
}: BentoTileHeaderProps) => (
  <CardHeader className={cn(bentoTileHeaderClassName, className)} data-testid={testId}>
    <div className={bentoTileHeaderRowClassName}>
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
      <span className="ml-auto flex h-5 shrink-0 items-center gap-1.5">{action}</span>
    </div>
  </CardHeader>
);
