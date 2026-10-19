import type { BentoSize } from "@/lib/bento-tile-layout";
import { type BentoLayoutRule, pickBentoLayout } from "@/lib/bento-tile-layout";

export type MediaLayoutVariant = "split" | "stack" | "hero";

const MEDIA_EXACT: Partial<Record<string, MediaLayoutVariant>> = {
  "3x2": "stack",
  "3x3": "stack",
  "3x4": "stack",
  "3x5": "stack",
  "3x6": "stack",
  "6x3": "hero",
  "6x4": "hero",
  "6x5": "hero",
  "6x6": "hero",
  "12x3": "hero",
  "12x4": "hero",
  "12x5": "hero",
  "12x6": "hero",
};

const MEDIA_RULES: readonly BentoLayoutRule<MediaLayoutVariant>[] = [
  { minCol: 6, minRow: 3, variant: "hero" },
  { maxCol: 4, variant: "stack" },
  { minCol: 6, variant: "split" },
];

export const pickMediaLayout = (size: BentoSize): MediaLayoutVariant =>
  pickBentoLayout(MEDIA_EXACT, MEDIA_RULES, size, "split");

export const mediaLayoutClasses = (
  variant: MediaLayoutVariant,
  size: BentoSize,
): { body: string; content: string; art: string; title: string } => {
  if (variant === "hero") {
    return {
      body: "flex min-h-0 flex-1 flex-col overflow-hidden",
      content: "flex min-h-0 flex-1 items-stretch gap-3",
      art: "aspect-square h-full max-h-full w-auto shrink-0 overflow-hidden rounded-lg",
      title: "line-clamp-3 text-body leading-snug font-medium",
    };
  }
  if (variant === "stack") {
    return {
      body: "flex min-h-0 flex-1 flex-col overflow-hidden",
      content: "flex min-h-0 flex-1 flex-col items-center gap-2 overflow-hidden",
      art: "aspect-square h-full max-h-full w-auto max-w-full overflow-hidden rounded-lg",
      title: "line-clamp-2 w-full shrink-0 text-center text-body leading-snug font-medium",
    };
  }
  return {
    body: "flex min-h-0 flex-1 overflow-hidden",
    content: "flex h-full min-h-0 items-center gap-3",
    art:
      size.row === 2
        ? "aspect-square h-full max-h-20 w-auto shrink-0 overflow-hidden rounded-lg"
        : "aspect-square h-full max-h-32 w-auto shrink-0 overflow-hidden rounded-lg",
    title: "line-clamp-2 text-body leading-snug font-medium",
  };
};

export const machineLayoutClasses = {
  body: "flex flex-col overflow-hidden",
  grid: "flex min-h-0 flex-1 flex-col gap-2",
};

export type GithubLayoutVariant = "default" | "spacious";

const GITHUB_RULES: readonly BentoLayoutRule<GithubLayoutVariant>[] = [
  { minRow: 4, variant: "spacious" },
];

export const pickGithubLayout = (size: BentoSize): GithubLayoutVariant =>
  pickBentoLayout({}, GITHUB_RULES, size, "default");

export const githubLayoutClasses: Record<
  GithubLayoutVariant,
  { body: string; statCell: string; statValue: string }
> = {
  default: {
    body: "flex flex-col content-start gap-2 overflow-hidden py-2",
    statCell: "rounded-lg bg-muted/40 px-2.5 py-2",
    statValue: "mt-0.5 text-sm font-medium tabular-nums",
  },
  spacious: {
    body: "flex flex-col content-start gap-2.5 overflow-hidden py-2.5",
    statCell: "rounded-lg bg-muted/40 px-2.5 py-2.5",
    statValue: "mt-1 text-lg font-semibold tabular-nums",
  },
};

/** Row-height budget for list rows. More rows → more items, never scroll. */
export const integrationListCap = (row: number): number => row + Math.max(1, row - 2);

export const steamLayoutClasses = {
  body: "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden py-2",
  profile: "shrink-0",
  list: "mt-auto grid auto-rows-min content-start gap-1",
};
