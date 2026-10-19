import type { HistoryEntry, HistorySpan, TelemetryState } from "@pryladova/shared";
import { useCallback, useEffect, useRef, useState } from "react";
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
  applyTelemetryUpdate,
  createHistorySession,
  type HistorySession,
  projectLiveHistory,
  projectLiveSpans,
} from "@/lib/history-live";

export type HistoryState =
  | { status: "loading" }
  | { status: "ready"; label: string; entries: HistoryEntry[]; spans: HistorySpan[] }
  | { status: "empty"; label: string }
  | { status: "error"; message: string };

const LIVE_TICK_MS = 1_000;

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
  const [dayOffset, setDayOffset] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const sessionRef = useRef<HistorySession | null>(null);
  const labelRef = useRef(formatLocalDayLabel());
  const telemetryRef = useRef(telemetry);
  const liveCapRef = useRef(liveCapMs);
  const todayKeyRef = useRef(localDayKey());
  const loadGenerationRef = useRef(0);
  telemetryRef.current = telemetry;
  liveCapRef.current = liveCapMs;

  const selectedDay = shiftLocalDay(dayOffset);
  const dayLabel = formatLocalDayLabel(selectedDay);
  labelRef.current = dayLabel;
  const isToday = dayOffset === 0;
  const dayRange = localDayUtcRange(selectedDay);

  const publishSession = useCallback((session: HistorySession) => {
    sessionRef.current = session;
    setState(projectState(session, labelRef.current, Date.now(), liveCapRef.current));
  }, []);

  const loadSnapshot = useCallback(
    async (options?: { manual?: boolean }) => {
      if (!enabled) {
        return;
      }

      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      const offset = dayOffset;
      const day = shiftLocalDay(offset);
      sessionRef.current = null;
      labelRef.current = formatLocalDayLabel(day);
      if (offset === 0) {
        todayKeyRef.current = localDayKey();
      }

      if (options?.manual) {
        setRefreshing(true);
      } else {
        setRefreshing(false);
        setState({ status: "loading" });
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

        publishSession(
          createHistorySession(
            result.entries,
            snapshotAtMs,
            liveTelemetry
              ? { appName: liveTelemetry.appName, capturedAt: liveTelemetry.capturedAt }
              : null,
            result.spans,
            Date.parse(to),
          ),
        );
      } catch (error: unknown) {
        if (generation !== loadGenerationRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        setState({ status: "error", message });
      } finally {
        if (options?.manual && generation === loadGenerationRef.current) {
          setRefreshing(false);
        }
      }
    },
    [dayOffset, enabled, publishSession],
  );

  const refreshHistory = useCallback(async (): Promise<void> => {
    await loadSnapshot({ manual: true });
  }, [loadSnapshot]);

  const stepDay = useCallback((direction: -1 | 1) => {
    setDayOffset((current) => clampHistoryDayOffset(current + direction));
  }, []);

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      setHasLoaded(false);
      setState({
        status: "empty",
        label: formatLocalDayLabel(shiftLocalDay(dayOffset)),
      });
      return;
    }

    void loadSnapshot();
  }, [enabled, dayOffset, loadSnapshot]);

  useEffect(() => {
    if (!enabled || !isToday || !telemetry || !sessionRef.current) {
      return;
    }

    publishSession(applyTelemetryUpdate(sessionRef.current, telemetry));
  }, [enabled, isToday, publishSession, telemetry]);

  useEffect(() => {
    if (!enabled || !isToday) {
      return;
    }

    const timer = window.setInterval(() => {
      if (localDayKey() !== todayKeyRef.current) {
        todayKeyRef.current = localDayKey();
        void loadSnapshot();
        return;
      }

      const session = sessionRef.current;
      if (!session) {
        return;
      }
      setState(projectState(session, labelRef.current, Date.now(), liveCapRef.current));
    }, LIVE_TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, isToday, loadSnapshot]);

  return {
    history: state,
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
