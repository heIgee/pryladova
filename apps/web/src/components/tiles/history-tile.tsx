import type { HistoryEntry, HistorySpan } from "@pryladova/shared";
import { ChevronLeft, ChevronRight, Clock3, RefreshCw } from "lucide-react";
import {
  type MouseEvent,
  type PointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { headerIconButtonClassName } from "@/components/layout/shell";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import {
  bentoTileBodyClassName,
  bentoTileBodyClipClassName,
  bentoTileCardClassName,
  bentoTileLucideIconClassName,
} from "@/components/tiles/bento-tile-header-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, skeletonSize } from "@/components/ui/skeleton";
import { useBentoTileSize } from "@/hooks/use-bento-tile-size";
import type { HistoryState } from "@/hooks/use-history";
import { integrationListCap } from "@/lib/bento-tile-variants";
import {
  fitHistoryRows,
  formatDurationSec,
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
  switchCount = 0,
  widthPercent,
  active = false,
  muted = false,
}: {
  appName: string;
  durationSec: number;
  switchCount?: number;
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
      <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums text-muted-foreground">
        <span
          className={cn("min-w-6 text-right text-micro", switchCount > 0 ? null : "invisible")}
          aria-hidden={switchCount <= 0}
          title={switchCount > 0 ? `${switchCount} focus changes` : undefined}
        >
          {switchCount > 0 ? `${switchCount}×` : "0×"}
        </span>
        <span>{formatDurationSec(durationSec)}</span>
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

const stopTileDrag = (event: PointerEvent<HTMLSpanElement>) => {
  event.stopPropagation();
};

const DayChevron = ({
  direction,
  enabled,
  label,
  testId,
  onStep,
}: {
  direction: -1 | 1;
  enabled: boolean;
  label: string;
  testId: string;
  onStep: (direction: -1 | 1) => void;
}) => {
  const Icon = direction < 0 ? ChevronLeft : ChevronRight;
  return (
    <span className="inline-flex" onPointerDown={stopTileDrag}>
      <button
        type="button"
        disabled={!enabled}
        className={cn(
          "inline-flex size-3.5 items-center justify-center text-muted-foreground",
          enabled ? "cursor-default hover:text-foreground" : "pointer-events-none opacity-30",
        )}
        aria-label={label}
        data-testid={testId}
        onClick={() => {
          onStep(direction);
        }}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
};

const formatLocalClock = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);

const STRIP_ALPHAS = [1, 0.65, 0.4, 0.2] as const;

const shadeIndexForApp = (appName: string): number => {
  let hash = 0;
  for (const char of appName) {
    hash = (hash + char.charCodeAt(0)) % STRIP_ALPHAS.length;
  }
  return hash;
};

type HistoryStripSlice = {
  appName: string;
  shadeIndex: number;
  startMs: number;
  endMs: number;
};

const recordedHistorySpan = (spans: HistorySpan[]): { startMs: number; endMs: number } | null => {
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    const start = Date.parse(span.startedAt);
    const end = Date.parse(span.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    startMs = Math.min(startMs, start);
    endMs = Math.max(endMs, end);
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  return { startMs, endMs };
};

const buildHistoryStripSlices = (spans: HistorySpan[]): HistoryStripSlice[] => {
  const slices: HistoryStripSlice[] = [];
  let previousShade = -1;
  for (const span of spans) {
    const startMs = Date.parse(span.startedAt);
    const endMs = Date.parse(span.endedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }
    let shadeIndex = shadeIndexForApp(span.appName);
    if (shadeIndex === previousShade) {
      shadeIndex = (shadeIndex + 1) % STRIP_ALPHAS.length;
    }
    previousShade = shadeIndex;
    slices.push({ appName: span.appName, shadeIndex, startMs, endMs });
  }
  return slices;
};

const findHistoryStripSlice = (
  slices: HistoryStripSlice[],
  timeMs: number,
): HistoryStripSlice | null => {
  let low = 0;
  let high = slices.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const slice = slices[mid];
    if (!slice) {
      return null;
    }
    if (timeMs < slice.startMs) {
      high = mid - 1;
      continue;
    }
    if (timeMs >= slice.endMs) {
      low = mid + 1;
      continue;
    }
    return slice;
  }
  return null;
};

const paintHistoryStrip = (
  canvas: HTMLCanvasElement,
  slices: HistoryStripSlice[],
  dayStartMs: number,
  daySpanMs: number,
) => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * pixelRatio);
  const height = Math.round(rect.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = getComputedStyle(canvas).color;
  for (const slice of slices) {
    const x = ((slice.startMs - dayStartMs) / daySpanMs) * rect.width;
    const sliceWidth = ((slice.endMs - slice.startMs) / daySpanMs) * rect.width;
    context.globalAlpha = STRIP_ALPHAS[slice.shadeIndex] ?? 1;
    context.fillRect(x, 0, Math.max(sliceWidth, 1), rect.height);
  }
  context.globalAlpha = 1;
};

const HistoryDayStrip = ({
  spans,
  dayRange,
  fitted,
}: {
  spans: HistorySpan[];
  dayRange: { from: string; to: string };
  fitted: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverTimeRef = useRef<number | null>(null);
  const [active, setActive] = useState<HistoryStripSlice | null>(null);
  const dayStart = new Date(dayRange.from);
  const dayEnd = new Date(dayRange.to);
  const dayStartMs = dayStart.getTime();
  const daySpanMs = Math.max(dayEnd.getTime() - dayStartMs, 1);
  const slices = useMemo(() => buildHistoryStripSlices(spans), [spans]);
  const recordedStartMs = slices[0]?.startMs ?? dayStartMs;
  const recordedEndMs = slices.at(-1)?.endMs ?? dayStartMs + daySpanMs;
  const canFit = slices.length > 0 && recordedEndMs - recordedStartMs < daySpanMs * 0.9;
  const viewStartMs = fitted && canFit ? recordedStartMs : dayStartMs;
  const viewSpanMs = Math.max(
    (fitted && canFit ? recordedEndMs : dayStartMs + daySpanMs) - viewStartMs,
    1,
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const paint = () => {
      paintHistoryStrip(canvas, slices, viewStartMs, viewSpanMs);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [slices, viewSpanMs, viewStartMs]);

  useLayoutEffect(() => {
    const hoverTime = hoverTimeRef.current;
    if (hoverTime === null) {
      return;
    }
    setActive(findHistoryStripSlice(slices, hoverTime));
  }, [slices]);

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const timeMs = viewStartMs + ((event.clientX - rect.left) / rect.width) * viewSpanMs;
    hoverTimeRef.current = timeMs;
    const next = findHistoryStripSlice(slices, timeMs);
    setActive((current) => (current === next ? current : next));
  };

  const onMouseLeave = () => {
    hoverTimeRef.current = null;
    setActive(null);
  };

  const center =
    active === null ? 0 : ((active.startMs + active.endMs) / 2 - viewStartMs) / viewSpanMs;
  const centerPercent = center * 100;
  const popupShift = centerPercent < 12 ? "0%" : centerPercent > 88 ? "-100%" : "-50%";
  const durationSec = active ? Math.max(1, Math.round((active.endMs - active.startMs) / 1000)) : 0;
  const viewStartLabel = formatLocalClock(new Date(viewStartMs));
  const viewMidLabel = formatLocalClock(new Date(viewStartMs + viewSpanMs / 2));
  const viewEndLabel = formatLocalClock(new Date(viewStartMs + viewSpanMs));

  return (
    <div
      className="shrink-0 px-(--card-spacing) pt-(--card-spacing)"
      data-testid="history-day-strip"
    >
      <div className="relative">
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 size-full text-foreground"
            role="img"
            aria-label="Day timeline"
          />
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: one hit target for the whole day */}
        <div
          className="absolute inset-x-0 -top-1.5 h-5"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        />
        {active ? (
          <div
            className="pointer-events-none absolute bottom-full z-20 mb-1.5 rounded-md bg-background px-2 py-1 shadow-lg ring-1 ring-border/60"
            style={{ left: `${centerPercent}%`, transform: `translateX(${popupShift})` }}
            data-testid="history-day-strip-popup"
          >
            <p className="truncate text-caption font-medium text-foreground">{active.appName}</p>
            <p className="whitespace-nowrap text-micro text-muted-foreground">
              {formatLocalClock(new Date(active.startMs))}–
              {formatLocalClock(new Date(active.endMs))} · {formatDurationSec(durationSec)}
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-micro text-muted-foreground">
        <span>{viewStartLabel}</span>
        <span>{viewMidLabel}</span>
        <span>{viewEndLabel}</span>
      </div>
    </div>
  );
};

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
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span aria-hidden className="invisible min-w-6 text-micro">
              0×
            </span>
            <Skeleton className={skeletonSize.duration} />
          </span>
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
  gapPx,
}: {
  entries: HistoryEntry[];
  other: { appCount: number; durationSec: number } | null;
  activeAppName?: string | null;
  gapPx?: number;
}) => {
  const barEntries = other
    ? [...entries, { appName: "Other", durationSec: other.durationSec }]
    : entries;
  const maxDuration = Math.max(...barEntries.map((entry) => entry.durationSec), 1);

  return (
    <ul className="flex flex-col gap-3" style={gapPx == null ? undefined : { gap: gapPx }}>
      {entries.map((entry) => {
        const widthPercent = Math.max(4, Math.round((entry.durationSec / maxDuration) * 100));
        return (
          <HistoryBarRow
            key={entry.appName}
            appName={entry.appName}
            durationSec={entry.durationSec}
            switchCount={entry.switchCount}
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

export const HistoryTile = ({
  history,
  dayLabel,
  dayRange,
  activeAppName,
  refreshing = false,
  hasLoaded = false,
  canStepBack = false,
  canStepForward = false,
  onStepDay,
  onRefresh,
  className,
}: {
  history: HistoryState;
  dayLabel: string;
  dayRange: { from: string; to: string };
  activeAppName?: string | null;
  refreshing?: boolean;
  hasLoaded?: boolean;
  canStepBack?: boolean;
  canStepForward?: boolean;
  onStepDay?: (direction: -1 | 1) => void;
  onRefresh?: () => void;
  className?: string;
}) => {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [stripFitted, setStripFitted] = useState(false);
  const [listFit, setListFit] = useState<{ count: number; gapPx: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const baseGapRef = useRef<number | null>(null);
  const expanded = expandedDay === dayLabel;
  const { row } = useBentoTileSize();
  const rowBudget = listFit?.count ?? integrationListCap(row);
  const loadedForSelectedDay =
    (history.status === "ready" || history.status === "empty") && history.label === dayLabel;
  const showSkeleton =
    history.status === "loading" ||
    ((history.status === "ready" || history.status === "empty") && !loadedForSelectedDay);
  const isReady = history.status === "ready" && loadedForSelectedDay;
  const showDayStrip = isReady && history.spans.length > 0;
  const isEmpty = history.status === "empty" && loadedForSelectedDay;
  const needsOtherBucket = isReady && history.entries.length > rowBudget;
  const visibleLimit = needsOtherBucket ? Math.max(1, rowBudget - 1) : rowBudget;

  const summary = isReady ? summarizeHistoryEntries(history.entries) : null;
  const canPartition = isReady && history.entries.length > visibleLimit;
  const partition = isReady
    ? partitionHistoryEntries(history.entries, {
        activeAppName,
        expanded,
        limit: visibleLimit,
      })
    : null;

  const renderedCount = partition ? partition.visible.length + (partition.other ? 1 : 0) : 0;
  const fillsHeight =
    !expanded && listFit != null && renderedCount === listFit.count && listFit.count > 1;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || (!showSkeleton && renderedCount === 0)) {
      return;
    }
    const measure = () => {
      const list = content.querySelector("ul");
      const rowEl = list?.querySelector("li");
      if (!list || !rowEl) {
        return;
      }
      if (baseGapRef.current == null) {
        const parsed = Number.parseFloat(getComputedStyle(list).rowGap);
        baseGapRef.current = Number.isFinite(parsed) ? parsed : 0;
      }
      const style = getComputedStyle(content);
      const available =
        content.clientHeight -
        (Number.parseFloat(style.paddingTop) || 0) -
        (Number.parseFloat(style.paddingBottom) || 0);
      const next = fitHistoryRows(
        available,
        rowEl.getBoundingClientRect().height,
        baseGapRef.current,
      );
      setListFit((current) =>
        current != null &&
        current.count === next.count &&
        Math.abs(current.gapPx - next.gapPx) < 0.5
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [showSkeleton, renderedCount]);

  const canRefresh = Boolean(onRefresh) && (hasLoaded || history.status !== "loading");
  const recordedSpan = isReady ? recordedHistorySpan(history.spans) : null;
  const daySpanMs = Date.parse(dayRange.to) - Date.parse(dayRange.from);
  const canFitStrip =
    recordedSpan !== null && recordedSpan.endMs - recordedSpan.startMs < daySpanMs * 0.9;
  const stripScaleLabel = !canFitStrip
    ? null
    : stripFitted
      ? "All day"
      : `${formatLocalClock(new Date(recordedSpan.startMs))}–${formatLocalClock(new Date(recordedSpan.endMs))}`;

  const headerAction = (
    <>
      {stripScaleLabel ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-micro text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-pressed={stripFitted}
          aria-label={stripFitted ? "Show the full day" : "Show recorded hours"}
          data-testid="history-day-strip-scale"
          onClick={() => {
            setStripFitted((current) => !current);
          }}
        >
          {stripScaleLabel}
        </button>
      ) : null}
      {canPartition ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-micro text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={expanded ? "Show fewer apps" : "Show all apps"}
          data-testid="history-expand-toggle"
          onClick={() => {
            setExpandedDay((current) => (current === dayLabel ? null : dayLabel));
          }}
        >
          {expanded ? "Show less" : "Show all"}
        </button>
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
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );

  return (
    <Card size="sm" className={cn(bentoTileCardClassName, className)} data-testid="history-tile">
      <BentoTileHeader
        testId="history-tile-header"
        icon={<Clock3 className={bentoTileLucideIconClassName} aria-hidden="true" />}
        title={dayLabel}
        titleTestId="history-day-label"
        aroundTitle={
          onStepDay
            ? {
                leading: (
                  <DayChevron
                    direction={-1}
                    enabled={canStepBack}
                    label="Previous day"
                    testId="history-day-previous"
                    onStep={onStepDay}
                  />
                ),
                trailing: (
                  <DayChevron
                    direction={1}
                    enabled={canStepForward}
                    label="Next day"
                    testId="history-day-next"
                    onStep={onStepDay}
                  />
                ),
              }
            : undefined
        }
        detail={
          summary
            ? `${formatDurationSec(summary.totalDurationSec)} tracked · ${summary.appCount} apps`
            : null
        }
        action={headerAction}
      />
      {showSkeleton ? (
        <div
          className="shrink-0 px-(--card-spacing) pt-(--card-spacing)"
          data-testid="history-day-strip-skeleton"
          aria-hidden="true"
        >
          <Skeleton className={skeletonSize.bar} />
        </div>
      ) : null}
      {showDayStrip ? (
        <HistoryDayStrip spans={history.spans} dayRange={dayRange} fitted={stripFitted} />
      ) : null}
      <CardContent
        ref={contentRef}
        className={cn(
          expanded ? bentoTileBodyClassName : bentoTileBodyClipClassName,
          (showSkeleton || showDayStrip) && "pt-3!",
        )}
      >
        {showSkeleton ? <HistoryLoadingSkeleton /> : null}
        {isEmpty ? (
          <p className="text-caption text-muted-foreground">
            No recorded app time on {history.label}.
          </p>
        ) : null}
        {history.status === "error" ? (
          <p className="text-caption text-destructive">{history.message}</p>
        ) : null}
        {partition ? (
          <HistoryBars
            entries={partition.visible}
            other={partition.other}
            activeAppName={activeAppName}
            gapPx={fillsHeight ? listFit.gapPx : undefined}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};
