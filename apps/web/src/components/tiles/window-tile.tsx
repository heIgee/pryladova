import { pickSpinnerVerb, type TelemetryState } from "@pryladova/shared";
import { Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import {
  bentoTileBodyClipClassName,
  bentoTileCardClassName,
  bentoTileLucideIconClassName,
} from "@/components/tiles/bento-tile-header-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useBentoTileSize } from "@/hooks/use-bento-tile-size";
import { useClassificationDisplay } from "@/hooks/use-classification-display";
import { useDebouncedFocusLoading } from "@/hooks/use-settled-focus-key";
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
  const { row } = useBentoTileSize();
  const short = row < 3;
  const titleClamp = short ? "truncate" : "line-clamp-2";
  const subtitleClamp = short ? "truncate" : "line-clamp-3";
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
  const distinctWindowTitle = hasDistinctWindowTitle(telemetry);
  const settledWindowSubtitle = resolveWindowSubtitle(telemetry, layoutName);
  const settledDisplay = {
    layoutName,
    windowSubtitle: settledWindowSubtitle,
    showSubtitleSlot: settledWindowSubtitle != null,
  };
  const skeletonDisplay = {
    layoutName: telemetry.appName,
    windowSubtitle: distinctWindowTitle ? telemetry.windowTitle : null,
    showSubtitleSlot: distinctWindowTitle,
  };
  const { showSkeleton: showNameSkeleton, display: windowDisplay } = useDebouncedFocusLoading(
    focusKey,
    settledDisplay,
    skeletonDisplay,
    {
      enabled: classificationEnabled,
      isPending: status === "pending",
    },
  );

  const showClassificationChips =
    showCategory ||
    showWorkChip ||
    showSpinner ||
    isClassificationFailed ||
    isMisconfigured ||
    !classificationEnabled ||
    status === "disabled";

  return (
    <Card size="sm" className={bentoTileCardClassName} data-testid="window-tile">
      <BentoTileHeader
        testId="window-tile-header"
        icon={<Monitor className={bentoTileLucideIconClassName} aria-hidden="true" />}
        title="Window"
        action={
          classificationEnabled || showClassificationChips ? (
            <div
              className="flex h-5 max-w-full items-center gap-1.5 overflow-hidden"
              data-testid="window-tile-header-chips"
            >
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
          ) : null
        }
      />
      <CardContent
        className={cn(
          bentoTileBodyClipClassName,
          "flex min-w-0 flex-col overflow-x-hidden",
          short ? "gap-1 py-1" : "gap-2",
        )}
      >
        <div
          className={cn("grid min-w-0", short ? "gap-1" : "gap-2")}
          data-testid="window-tile-names"
        >
          <h2
            className={cn(WINDOW_TITLE_CLASS, "relative")}
            data-testid="window-tile-title-slot"
            aria-busy={showNameSkeleton}
            aria-label={showNameSkeleton ? "Loading window name" : undefined}
          >
            <span className={cn("block", titleClamp, showNameSkeleton && "invisible")}>
              {windowDisplay.layoutName.trim().length > 0 ? windowDisplay.layoutName : "\u00a0"}
            </span>
            {showNameSkeleton ? (
              <Skeleton as="span" className={WINDOW_TITLE_SKELETON_CLASS} aria-hidden="true" />
            ) : null}
          </h2>
          {windowDisplay.showSubtitleSlot ? (
            <div
              className={cn(WINDOW_SUBTITLE_CLASS, "relative text-muted-foreground", subtitleClamp)}
              data-testid="window-tile-subtitle-slot"
            >
              <span className={cn(showNameSkeleton && "invisible")}>
                {showNameSkeleton
                  ? (windowDisplay.windowSubtitle?.trim().length ?? 0) > 0
                    ? windowDisplay.windowSubtitle
                    : "\u00a0"
                  : windowDisplay.windowSubtitle}
              </span>
              {showNameSkeleton ? (
                <Skeleton as="span" className={WINDOW_SUBTITLE_SKELETON_CLASS} aria-hidden="true" />
              ) : null}
            </div>
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
