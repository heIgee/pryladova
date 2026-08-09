import type { HistoryEntry, TelemetryState } from "@pryladova/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHistory, formatLocalDayLabel, localDayUtcRange } from "@/lib/history";
import {
  applyTelemetryUpdate,
  createHistorySession,
  type HistorySession,
  type LiveHistoryTracker,
  projectLiveHistory,
} from "@/lib/history-live";

export type HistoryState =
  | { status: "loading" }
  | { status: "ready"; label: string; entries: HistoryEntry[] }
  | { status: "empty"; label: string }
  | { status: "error"; message: string };

const LIVE_TICK_MS = 1_000;

const projectState = (
  tracker: LiveHistoryTracker,
  label: string,
  nowMs: number,
  liveCapMs: number | null,
): HistoryState => {
  const entries = projectLiveHistory(tracker, nowMs, liveCapMs ?? undefined);
  if (entries.length === 0) {
    return { status: "empty", label };
  }
  return { status: "ready", label, entries };
};

export const useHistory = (
  enabled: boolean,
  telemetry: TelemetryState | null,
  liveCapMs: number | null = null,
) => {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const sessionRef = useRef<HistorySession | null>(null);
  const labelRef = useRef(formatLocalDayLabel());
  const telemetryRef = useRef(telemetry);
  const liveCapRef = useRef(liveCapMs);
  telemetryRef.current = telemetry;
  liveCapRef.current = liveCapMs;

  const publishSession = useCallback((session: HistorySession) => {
    sessionRef.current = session;
    setState(projectState(session.tracker, labelRef.current, Date.now(), liveCapRef.current));
  }, []);

  const loadSnapshot = useCallback(
    async (options?: { manual?: boolean }) => {
      if (!enabled) {
        return;
      }

      if (options?.manual) {
        setRefreshing(true);
      }

      labelRef.current = formatLocalDayLabel();
      const { from, to } = localDayUtcRange();
      const snapshotAtMs = Date.now();
      const liveTelemetry = telemetryRef.current;

      try {
        const result = await fetchHistory(from, to);
        setHasLoaded(true);

        publishSession(
          createHistorySession(
            result.entries,
            snapshotAtMs,
            liveTelemetry
              ? { appName: liveTelemetry.appName, capturedAt: liveTelemetry.capturedAt }
              : null,
          ),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setState({ status: "error", message });
      } finally {
        if (options?.manual) {
          setRefreshing(false);
        }
      }
    },
    [enabled, publishSession],
  );

  const refreshHistory = useCallback(async (): Promise<void> => {
    await loadSnapshot({ manual: true });
  }, [loadSnapshot]);

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      setHasLoaded(false);
      setState({ status: "loading" });
      return;
    }

    void loadSnapshot();
  }, [enabled, loadSnapshot]);

  useEffect(() => {
    if (!enabled || !telemetry || !sessionRef.current) {
      return;
    }

    publishSession(applyTelemetryUpdate(sessionRef.current, telemetry));
  }, [enabled, publishSession, telemetry]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      setState(projectState(session.tracker, labelRef.current, Date.now(), liveCapRef.current));
    }, LIVE_TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled]);

  return {
    history: state,
    refreshHistory,
    refreshing,
    hasLoaded,
  };
};
