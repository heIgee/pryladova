import { pickSpinnerVerb, type TelemetryState } from "@pryladova/shared";
import { Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useClassificationDisplay } from "@/hooks/use-classification-display";
import { useUnsettledFocusKey } from "@/hooks/use-settled-focus-key";
import { cn } from "@/lib/utils";

const MutedChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-micro font-medium leading-none text-muted-foreground">
    {children}
  </span>
);

const normalizeLabel = (value: string): string => value.trim().toLowerCase();

const titlesMatch = (left: string, right: string): boolean =>
  normalizeLabel(left) === normalizeLabel(right);

const classificationSeed = (telemetry: TelemetryState): string =>
  `${telemetry.appName}|${telemetry.windowTitle}|${telemetry.receivedAt}`;

const windowFocusKey = (telemetry: TelemetryState): string =>
  `${telemetry.appName}|${telemetry.windowTitle}|${telemetry.capturedAt}`;

const hasDistinctWindowTitle = (telemetry: TelemetryState): boolean =>
  telemetry.windowTitle.trim().length > 0 && !titlesMatch(telemetry.windowTitle, telemetry.appName);

const resolveWindowSubtitle = (telemetry: TelemetryState, layoutName: string): string | null => {
  if (telemetry.windowTitle.trim().length === 0) {
    return null;
  }
  if (titlesMatch(telemetry.windowTitle, layoutName)) {
    return null;
  }
  if (titlesMatch(telemetry.windowTitle, telemetry.appName)) {
    return null;
  }
  return telemetry.windowTitle;
};

/** Must match loaded title typography exactly. */
const WINDOW_TITLE_CLASS = "text-display font-medium leading-[1.1]";

/** Must match loaded subtitle: text-body + leading-relaxed (1.625), not text-body line-height (1.5). */
const WINDOW_SUBTITLE_CLASS = "text-body leading-relaxed";

/** Overlay bar; line box comes from invisible text (1lh ignores font em-box overshoot). */
const WINDOW_TITLE_SKELETON_CLASS =
  "pointer-events-none absolute inset-y-0 left-0 h-full w-full max-w-[min(75%,20rem)]";

const WINDOW_SUBTITLE_SKELETON_CLASS =
  "pointer-events-none absolute inset-y-0 left-0 h-full w-full max-w-[min(90%,28rem)]";

export const WindowTile = ({
  telemetry,
  classificationEnabled,
  settingsError,
  settingsSyncing,
  settingsReady,
  onClassificationChange,
}: {
  telemetry: TelemetryState;
  classificationEnabled: boolean;
  settingsError: string | null;
  settingsSyncing: boolean;
  settingsReady: boolean;
  onClassificationChange: (enabled: boolean) => void;
}) => {
  const status = telemetry.classificationStatus;
  const {
    badgeClassification,
    showCategory,
    showWorkChip,
    showSpinner,
    isClassificationFailed,
    isMisconfigured,
  } = useClassificationDisplay(telemetry, classificationEnabled);
  const classifiedName = telemetry.classification?.displayAppName ?? null;
  const layoutName = classifiedName ?? telemetry.appName;
  const focusKey = windowFocusKey(telemetry);
  const showNameSkeleton = useUnsettledFocusKey(focusKey, {
    enabled: classificationEnabled,
    isPending: status === "pending",
  });

  const distinctWindowTitle = hasDistinctWindowTitle(telemetry);
  const windowSubtitle = showNameSkeleton ? null : resolveWindowSubtitle(telemetry, layoutName);
  const showSubtitleSlot = showNameSkeleton ? distinctWindowTitle : windowSubtitle != null;

  const showClassificationChips =
    showCategory ||
    showWorkChip ||
    showSpinner ||
    isClassificationFailed ||
    isMisconfigured ||
    !classificationEnabled ||
    status === "disabled";

  return (
    <Card size="sm" data-testid="window-tile">
      <CardHeader className="border-b" data-testid="window-tile-header">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Monitor className="size-3.5 text-muted-foreground" />
          Window
        </CardTitle>
        {classificationEnabled || showClassificationChips ? (
          <CardAction data-testid="window-tile-header-chips">
            <div className="flex min-h-5 max-w-full flex-wrap justify-end gap-1.5">
              {showCategory ? <Badge>{badgeClassification?.category}</Badge> : null}
              {showWorkChip ? (
                <Badge>{badgeClassification?.workRelated === "yes" ? "Work" : "Personal"}</Badge>
              ) : null}
              {showSpinner ? (
                <Badge variant="secondary">{pickSpinnerVerb(classificationSeed(telemetry))}…</Badge>
              ) : null}
              {isClassificationFailed ? (
                <Badge variant="secondary">Classification failed</Badge>
              ) : null}
              {isMisconfigured ? (
                <Badge variant="secondary">Classification unavailable</Badge>
              ) : null}
              {!classificationEnabled || status === "disabled" ? (
                <MutedChip>Classification off</MutedChip>
              ) : null}
              {classificationEnabled &&
              status === "pending" &&
              !showCategory &&
              !showWorkChip &&
              !showSpinner &&
              !isClassificationFailed &&
              !isMisconfigured ? (
                <span
                  className="invisible inline-flex h-5 items-center rounded-md px-2 text-micro"
                  aria-hidden="true"
                >
                  {"\u00a0"}
                </span>
              ) : null}
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="grid gap-2" data-testid="window-tile-names">
          <h2
            className={cn(WINDOW_TITLE_CLASS, "relative")}
            data-testid="window-tile-title-slot"
            aria-busy={showNameSkeleton}
            aria-label={showNameSkeleton ? "Loading window name" : undefined}
          >
            <span className={cn("block truncate", showNameSkeleton && "invisible")}>
              {layoutName.trim().length > 0 ? layoutName : "\u00a0"}
            </span>
            {showNameSkeleton ? (
              <Skeleton className={WINDOW_TITLE_SKELETON_CLASS} aria-hidden="true" />
            ) : null}
          </h2>
          {showSubtitleSlot ? (
            <p
              className={cn(WINDOW_SUBTITLE_CLASS, "relative line-clamp-3 text-muted-foreground")}
              data-testid="window-tile-subtitle-slot"
            >
              <span className={cn(showNameSkeleton && "invisible")}>
                {showNameSkeleton
                  ? telemetry.windowTitle.trim().length > 0
                    ? telemetry.windowTitle
                    : "\u00a0"
                  : windowSubtitle}
              </span>
              {showNameSkeleton ? (
                <Skeleton className={WINDOW_SUBTITLE_SKELETON_CLASS} aria-hidden="true" />
              ) : null}
            </p>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1">
        <label
          htmlFor="classify-toggle"
          className="flex w-fit cursor-pointer items-center gap-2 text-caption text-muted-foreground"
        >
          Classify with AI
          <Switch
            id="classify-toggle"
            size="sm"
            checked={classificationEnabled}
            disabled={!settingsReady || settingsSyncing}
            onCheckedChange={onClassificationChange}
          />
        </label>
        {settingsError ? <p className="text-caption text-destructive">{settingsError}</p> : null}
      </CardFooter>
    </Card>
  );
};
