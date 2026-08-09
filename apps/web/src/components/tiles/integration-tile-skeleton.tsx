import { Skeleton, skeletonSize } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const IntegrationTileSkeleton = () => (
  <div className="grid gap-2.5" aria-hidden="true" data-testid="integration-tile-skeleton">
    <div className="flex items-center gap-2.5">
      <Skeleton className={skeletonSize.avatar} />
      <div className="grid flex-1 gap-1.5">
        <Skeleton className={cn(skeletonSize.caption, "max-w-[40%]")} />
        <Skeleton className={cn(skeletonSize.micro, "max-w-[55%]")} />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Skeleton className={cn(skeletonSize.panel, "bg-muted/40")} />
      <Skeleton className={cn(skeletonSize.panel, "bg-muted/40")} />
    </div>
    <div className="grid gap-1.5">
      <Skeleton className={cn(skeletonSize.micro, "w-16")} />
      <Skeleton className={skeletonSize.caption} />
      <Skeleton className={cn(skeletonSize.caption, "max-w-[85%]")} />
    </div>
  </div>
);
