import type { HistoryEntry } from "@pryladova/shared";
import { Clock3, RefreshCw } from "lucide-react";
import { headerIconButtonClassName } from "@/components/layout/shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, skeletonSize } from "@/components/ui/skeleton";
import type { HistoryState } from "@/hooks/use-history";
import { formatDurationSec, summarizeHistoryEntries } from "@/lib/history";
import { cn } from "@/lib/utils";

const NOW_CHIP_CLASS =
  "inline-flex h-5 min-w-9 shrink-0 items-center justify-center rounded-md px-2 text-micro font-medium leading-none";

const NowChipSlot = ({ active }: { active: boolean }) => (
  <span
    className={cn(
      NOW_CHIP_CLASS,
      active ? "bg-muted text-muted-foreground" : "pointer-events-none invisible",
    )}
    aria-hidden={!active}
  >
    Now
  </span>
);

const HistoryBarRow = ({
  appName,
  durationSec,
  widthPercent,
  active = false,
  muted = false,
}: {
  appName: string;
  durationSec: number;
  widthPercent: number;
  active?: boolean;
  muted?: boolean;
}) => (
  <li className="flex flex-col gap-1">
    <div className="flex items-center justify-between gap-3 text-caption">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-foreground">{appName}</span>
        <NowChipSlot active={active} />
      </div>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatDurationSec(durationSec)}
      </span>
    </div>
    <div className={cn("h-2 rounded-full bg-muted", active && "ring-1 ring-primary/40")}>
      <div
        className={cn("h-2 rounded-full", muted ? "bg-muted-foreground/40" : "bg-primary/70")}
        style={{ width: `${widthPercent}%` }}
      />
    </div>
  </li>
);

const HISTORY_SKELETON_ROWS = ["one", "two", "three", "four"] as const;

const HistoryLoadingSkeleton = () => (
  <ul className="flex flex-col gap-3" aria-hidden="true" data-testid="history-tile-skeleton">
    {HISTORY_SKELETON_ROWS.map((rowKey) => (
      <li key={rowKey} className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Skeleton className={cn(skeletonSize.caption, "max-w-[40%] flex-1")} />
            <NowChipSlot active={false} />
          </div>
          <Skeleton className={skeletonSize.duration} />
        </div>
        <Skeleton className={skeletonSize.bar} />
      </li>
    ))}
  </ul>
);

const HistoryBars = ({
  entries,
  other,
  activeAppName,
}: {
  entries: HistoryEntry[];
  other: { appCount: number; durationSec: number } | null;
  activeAppName?: string | null;
}) => {
  const barEntries = other
    ? [...entries, { appName: "Other", durationSec: other.durationSec }]
    : entries;
  const maxDuration = Math.max(...barEntries.map((entry) => entry.durationSec), 1);

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => {
        const widthPercent = Math.max(4, Math.round((entry.durationSec / maxDuration) * 100));
        return (
          <HistoryBarRow
            key={entry.appName}
            appName={entry.appName}
            durationSec={entry.durationSec}
            widthPercent={widthPercent}
            active={activeAppName === entry.appName}
          />
        );
      })}
      {other ? (
        <HistoryBarRow
          appName={`Other · ${other.appCount} apps`}
          durationSec={other.durationSec}
          widthPercent={Math.max(4, Math.round((other.durationSec / maxDuration) * 100))}
          muted
        />
      ) : null}
    </ul>
  );
};

const HistoryReadyContent = ({
  entries,
  activeAppName,
}: {
  entries: HistoryEntry[];
  activeAppName?: string | null;
}) => <HistoryBars entries={entries} other={null} activeAppName={activeAppName} />;

export const HistoryTile = ({
  history,
  activeAppName,
  refreshing = false,
  hasLoaded = false,
  onRefresh,
  className,
}: {
  history: HistoryState;
  activeAppName?: string | null;
  refreshing?: boolean;
  hasLoaded?: boolean;
  onRefresh?: () => void;
  className?: string;
}) => {
  const title =
    history.status === "loading"
      ? "Today"
      : history.status === "ready" || history.status === "empty"
        ? history.label
        : "Today";

  const summary = history.status === "ready" ? summarizeHistoryEntries(history.entries) : null;

  const canRefresh = Boolean(onRefresh) && (hasLoaded || history.status !== "loading");

  return (
    <Card
      size="sm"
      className={cn("flex h-full min-h-0 flex-col", className)}
      data-testid="history-tile"
    >
      <CardHeader className="shrink-0 border-b">
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="shrink-0 text-sm font-medium mr-auto">{title}</span>
          {summary ? (
            <span className="min-w-0 truncate text-caption text-muted-foreground">
              {formatDurationSec(summary.totalDurationSec)} tracked · {summary.appCount} apps
            </span>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              disabled={!canRefresh || refreshing}
              className={cn(headerIconButtonClassName, "size-7 shrink-0")}
              aria-label="Refresh activity"
              title="Refresh activity"
              onClick={onRefresh}
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {history.status === "loading" ? <HistoryLoadingSkeleton /> : null}
          {history.status === "empty" ? (
            <p className="text-caption text-muted-foreground">No recorded focus time yet today.</p>
          ) : null}
          {history.status === "error" ? (
            <p className="text-caption text-destructive">{history.message}</p>
          ) : null}
          {history.status === "ready" ? (
            <HistoryReadyContent entries={history.entries} activeAppName={activeAppName} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
