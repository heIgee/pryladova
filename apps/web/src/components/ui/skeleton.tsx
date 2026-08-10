import type * as React from "react";

import { cn } from "@/lib/utils";

/** Height/width presets aligned to app typography (see index.css @theme text-* tokens). */
export const skeletonSize = {
  /** text-display line — pair with invisible text + absolute inset-y-0 h-full overlay, not h-[1lh] alone */
  display: "absolute inset-y-0 left-0 h-full w-full max-w-[min(75%,20rem)]",
  /** text-body + leading-relaxed — same invisible-text overlay pattern */
  body: "absolute inset-y-0 left-0 h-full w-full max-w-[min(90%,28rem)]",
  /** text-caption */
  caption: "h-4",
  /** text-micro */
  micro: "h-3",
  /** text-stat / text-sm */
  stat: "h-5",
  avatar: "size-9 shrink-0 rounded-lg",
  panel: "h-14 w-full rounded-lg",
  bar: "h-2 w-full rounded-full",
  duration: "h-4 w-10 shrink-0",
} as const;

function Skeleton({
  className,
  as: Tag = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "span" }) {
  return <Tag className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
