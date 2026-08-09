import type { HistoryEntry } from "@pryladova/shared";
import { Clock3, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { headerIconButtonClassName } from "@/components/layout/shell";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { HistoryState } from "@/hooks/use-history";
import {
  formatDurationSec,
  HISTORY_VISIBLE_LIMIT,
  partitionHistoryEntries,
  summarizeHistoryEntries,
} from "@/lib/history";
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
  <ul className="flex flex-col gap-3" aria-hidden="true">
    {HISTORY_SKELETON_ROWS.map((rowKey) => (
      <li key={rowKey} className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-4 max-w-[40%] flex-1 animate-pulse rounded bg-muted" />
            <NowChipSlot active={false} />
          </div>
          <div className="h-4 w-10 shrink-0 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-2 animate-pulse rounded-full bg-muted" />
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
}) => {
  const [expanded, setExpanded] = useState(false);
  const { visible, other } = useMemo(
    () =>
      partitionHistoryEntries(entries, {
        activeAppName,
        expanded,
      }),
    [activeAppName, entries, expanded],
  );
  const canExpand = entries.length > HISTORY_VISIBLE_LIMIT;

  const bars = <HistoryBars entries={visible} other={other} activeAppName={activeAppName} />;

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("overflow-y-auto [scrollbar-gutter:stable]", !expanded && "max-h-72")}>
        {bars}
      </div>
      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          className="self-start text-caption text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      ) : null}
    </div>
  );
};

export const HistoryTile = ({
  history,
  activeAppName,
  refreshing = false,
  hasLoaded = false,
  onRefresh,
}: {
  history: HistoryState;
  activeAppName?: string | null;
  refreshing?: boolean;
  hasLoaded?: boolean;
  onRefresh?: () => void;
}) => {
  const title =
    history.status === "loading"
      ? "Today"
      : history.status === "ready" || history.status === "empty"
        ? history.label
        : "Today";

  const summary = history.status === "ready" ? summarizeHistoryEntries(history.entries) : null;
  const readyFingerprint =
    history.status === "ready"
      ? `${history.entries.length}|${[...history.entries.map((entry) => entry.appName)].sort().join(",")}`
      : null;

  const canRefresh = Boolean(onRefresh) && (hasLoaded || history.status !== "loading");

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock3 className="size-3.5 text-muted-foreground" />
          {title}
        </CardTitle>
        {summary ? (
          <CardDescription className="text-caption">
            {formatDurationSec(summary.totalDurationSec)} tracked · {summary.appCount} apps
          </CardDescription>
        ) : null}
        {onRefresh ? (
          <CardAction>
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
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {history.status === "loading" ? <HistoryLoadingSkeleton /> : null}
        {history.status === "empty" ? (
          <p className="text-caption text-muted-foreground">No recorded focus time yet today.</p>
        ) : null}
        {history.status === "error" ? (
          <p className="text-caption text-destructive">{history.message}</p>
        ) : null}
        {history.status === "ready" ? (
          <HistoryReadyContent
            key={readyFingerprint}
            entries={history.entries}
            activeAppName={activeAppName}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};
