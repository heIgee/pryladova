import type { HistoryEntry, HistorySpan, TelemetryState } from "@pryladova/shared";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clampHistoryDayOffset,
  fetchHistory,
  formatLocalDayLabel,
  HISTORY_DAY_LOOKBACK,
  localDayKey,
  localDayUtcRange,
  shiftLocalDay,
} from "@/lib/history";
import {
  getHistoryDayOffsetServerSnapshot,
  readHistoryDayOffsetFromUrl,
  subscribeHistoryDayOffset,
  writeHistoryDayOffsetToUrl,
} from "@/lib/history-day-url";
import {
  applyTelemetryUpdate,
  createHistorySession,
  type HistorySession,
  projectLiveHistory,
  projectLiveSpans,
} from "@/lib/history-live";
import { getWallClockMs, getWallClockServerMs, subscribeWallClock } from "@/lib/wall-clock";

export type HistoryState =
  | { status: "loading" }
  | { status: "ready"; label: string; entries: HistoryEntry[]; spans: HistorySpan[] }
  | { status: "empty"; label: string }
  | { status: "error"; message: string };

const projectState = (
  session: HistorySession,
  label: string,
  nowMs: number,
  liveCapMs: number | null,
): HistoryState => {
  const entries = projectLiveHistory(session.tracker, nowMs, liveCapMs ?? undefined);
  if (entries.length === 0) {
    return { status: "empty", label };
  }
  return {
    status: "ready",
    label,
    entries,
    spans: projectLiveSpans(session.spans, nowMs, liveCapMs, session.dayEndMs),
  };
};

export const useHistory = (
  enabled: boolean,
  telemetry: TelemetryState | null,
  liveCapMs: number | null = null,
) => {
  const dayOffset = useSyncExternalStore(
    subscribeHistoryDayOffset,
    readHistoryDayOffsetFromUrl,
    getHistoryDayOffsetServerSnapshot,
  );
  const nowMs = useSyncExternalStore(
    enabled ? subscribeWallClock : () => () => {},
    getWallClockMs,
    getWallClockServerMs,
  );
  const [fetchState, setFetchState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; label: string }
    | { kind: "error"; message: string; label: string }
    | { kind: "ready"; session: HistorySession; label: string }
  >({ kind: "idle" });
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [, setSessionRevision] = useState(0);
  const sessionRef = useRef<HistorySession | null>(null);
  const todayKeyRef = useRef("");
  const loadGenerationRef = useRef(0);
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;

  const publishSession = (session: HistorySession) => {
    sessionRef.current = session;
    setSessionRevision((revision) => revision + 1);
  };
  const publishSessionRef = useRef(publishSession);
  publishSessionRef.current = publishSession;

  const calendarNow = new Date(nowMs);
  const selectedDay = shiftLocalDay(dayOffset, calendarNow);
  const dayLabel = formatLocalDayLabel(selectedDay);
  const isToday = dayOffset === 0;
  const dayRange = localDayUtcRange(selectedDay);

  const loadSnapshot = async (options?: { manual?: boolean }) => {
    if (!enabled) {
      return;
    }

    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    sessionRef.current = null;
    const offset = readHistoryDayOffsetFromUrl();
    const day = shiftLocalDay(offset, new Date());
    const label = formatLocalDayLabel(day);
    if (offset === 0) {
      todayKeyRef.current = localDayKey(new Date());
    }

    if (options?.manual) {
      setRefreshing(true);
    } else {
      setRefreshing(false);
      setFetchState({ kind: "loading", label });
    }

    const { from, to } = localDayUtcRange(day);
    const snapshotAtMs = Date.now();
    const liveTelemetry = offset === 0 ? telemetryRef.current : null;

    try {
      const result = await fetchHistory(from, to);
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setHasLoaded(true);
      const session = createHistorySession(
        result.entries,
        snapshotAtMs,
        liveTelemetry
          ? { appName: liveTelemetry.appName, capturedAt: liveTelemetry.capturedAt }
          : null,
        result.spans,
        Date.parse(to),
      );
      publishSession(session);
      setFetchState({ kind: "ready", label, session });
    } catch (error: unknown) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      setFetchState({ kind: "error", message, label });
    } finally {
      if (options?.manual && generation === loadGenerationRef.current) {
        setRefreshing(false);
      }
    }
  };

  const refreshHistory = async (): Promise<void> => {
    await loadSnapshot({ manual: true });
  };

  const stepDay = (direction: -1 | 1) => {
    writeHistoryDayOffsetToUrl(clampHistoryDayOffset(dayOffset + direction));
  };

  const loadSnapshotRef = useRef(loadSnapshot);
  loadSnapshotRef.current = loadSnapshot;

  // biome-ignore lint/correctness/useExhaustiveDependencies: dayOffset must retrigger fetch when the URL history day changes; loadSnapshot reads the URL.
  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      setHasLoaded(false);
      setFetchState({ kind: "idle" });
      return;
    }

    void loadSnapshotRef.current();
  }, [enabled, dayOffset]);

  useEffect(() => {
    if (!enabled || !isToday) {
      return;
    }

    const checkRollover = (): void => {
      const key = localDayKey(new Date());
      if (key !== todayKeyRef.current) {
        todayKeyRef.current = key;
        void loadSnapshotRef.current();
      }
    };

    const timer = window.setInterval(checkRollover, 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, isToday]);

  useEffect(() => {
    if (!enabled || !isToday || !telemetry || !sessionRef.current) {
      return;
    }

    publishSessionRef.current(applyTelemetryUpdate(sessionRef.current, telemetry));
  }, [enabled, isToday, telemetry]);

  let history: HistoryState;
  if (!enabled) {
    history = { status: "empty", label: dayLabel };
  } else if (fetchState.kind === "loading") {
    history = { status: "loading" };
  } else if (fetchState.kind === "error") {
    history =
      fetchState.label === dayLabel
        ? { status: "error", message: fetchState.message }
        : { status: "loading" };
  } else if (fetchState.kind === "ready" && fetchState.label === dayLabel && sessionRef.current) {
    history = projectState(sessionRef.current, dayLabel, nowMs, liveCapMs);
  } else {
    history = { status: "loading" };
  }

  return {
    history,
    dayLabel,
    dayRange,
    isToday,
    canStepBack: dayOffset > -HISTORY_DAY_LOOKBACK,
    canStepForward: dayOffset < 0,
    stepDay,
    refreshHistory,
    refreshing,
    hasLoaded,
  };
};
