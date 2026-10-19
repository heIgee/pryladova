import type { HistoryEntry, HistorySpan } from "@pryladova/shared";

const normalizeAppName = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type LiveHistoryTracker = {
  totals: Record<string, number>;
  switches: Record<string, number>;
  activeApp: string | null;
  activeSince: string | null;
  liveSinceMs: number;
};

export type TelemetryFocus = {
  appName: string;
  capturedAt: string;
};

export type HistorySession = {
  tracker: LiveHistoryTracker;
  spans: HistorySpan[];
  dayEndMs: number | null;
  lastCapturedAt: string | null;
};

export const createLiveHistoryTracker = (
  entries: HistoryEntry[],
  snapshotAtMs: number,
  activeApp: string | null,
  activeSince: string | null,
): LiveHistoryTracker => {
  const totals: Record<string, number> = {};
  const switches: Record<string, number> = {};

  for (const entry of entries) {
    const appName = normalizeAppName(entry.appName);
    if (!appName) {
      continue;
    }
    totals[appName] = (totals[appName] ?? 0) + entry.durationSec;
    if (entry.switchCount) {
      switches[appName] = (switches[appName] ?? 0) + entry.switchCount;
    }
  }

  return {
    totals,
    switches,
    activeApp: activeApp ? normalizeAppName(activeApp) : null,
    activeSince,
    liveSinceMs: snapshotAtMs,
  };
};

export const applyFocusBoundary = (
  tracker: LiveHistoryTracker,
  newApp: string,
  boundaryCapturedAt: string,
): LiveHistoryTracker => {
  const normalizedApp = normalizeAppName(newApp);
  if (!normalizedApp) {
    return tracker;
  }

  const boundaryMs = Date.parse(boundaryCapturedAt);
  let totals = tracker.totals;
  let switches = tracker.switches ?? {};

  if (tracker.activeApp) {
    const extensionSec = Math.max(0, Math.floor((boundaryMs - tracker.liveSinceMs) / 1000));
    totals = { ...tracker.totals };
    totals[tracker.activeApp] = (totals[tracker.activeApp] ?? 0) + extensionSec;
    if (tracker.activeApp !== normalizedApp) {
      switches = { ...tracker.switches };
      switches[tracker.activeApp] = (switches[tracker.activeApp] ?? 0) + 1;
    }
  }

  return {
    totals,
    switches,
    activeApp: normalizedApp,
    activeSince: boundaryCapturedAt,
    liveSinceMs: boundaryMs,
  };
};

export const setActiveWindow = (
  tracker: LiveHistoryTracker,
  activeApp: string,
  activeSince: string,
): LiveHistoryTracker => {
  const normalizedApp = normalizeAppName(activeApp);
  if (!normalizedApp) {
    return tracker;
  }

  return {
    ...tracker,
    activeApp: normalizedApp,
    activeSince,
  };
};

export const createHistorySession = (
  entries: HistoryEntry[],
  snapshotAtMs: number,
  telemetry: TelemetryFocus | null,
  spans: HistorySpan[] = [],
  dayEndMs: number | null = null,
): HistorySession => ({
  tracker: createLiveHistoryTracker(
    entries,
    snapshotAtMs,
    telemetry?.appName ?? null,
    telemetry?.capturedAt ?? null,
  ),
  spans,
  dayEndMs,
  lastCapturedAt: telemetry?.capturedAt ?? null,
});

const splitOpenHistorySpan = (
  spans: HistorySpan[],
  nextApp: string,
  boundaryCapturedAt: string,
): HistorySpan[] => {
  const normalized = normalizeAppName(nextApp);
  const boundaryMs = Date.parse(boundaryCapturedAt);
  if (!normalized || !Number.isFinite(boundaryMs)) {
    return spans;
  }

  const boundaryAt = new Date(boundaryMs).toISOString();
  const closed = spans.map((span) => {
    if (!span.open) {
      return span;
    }
    const endMs = Math.max(Date.parse(span.endedAt), boundaryMs);
    return {
      appName: span.appName,
      startedAt: span.startedAt,
      endedAt: new Date(endMs).toISOString(),
    };
  });
  closed.push({
    appName: normalized,
    startedAt: boundaryAt,
    endedAt: boundaryAt,
    open: true,
  });
  return closed;
};

export const projectLiveSpans = (
  spans: HistorySpan[],
  nowMs: number,
  capNowMs: number | null,
  dayEndMs: number | null,
): HistorySpan[] => {
  let edgeMs = capNowMs === null ? nowMs : Math.min(nowMs, capNowMs);
  if (dayEndMs !== null) {
    edgeMs = Math.min(edgeMs, dayEndMs);
  }

  return spans.map((span) => {
    if (!span.open) {
      return span;
    }
    const startMs = Date.parse(span.startedAt);
    const endMs = Date.parse(span.endedAt);
    const nextEndMs = Math.max(endMs, edgeMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(nextEndMs) || nextEndMs <= startMs) {
      return span;
    }
    if (nextEndMs === endMs) {
      return span;
    }
    return { ...span, endedAt: new Date(nextEndMs).toISOString() };
  });
};

export const applyTelemetryUpdate = (
  session: HistorySession,
  next: TelemetryFocus,
): HistorySession => {
  const appName = normalizeAppName(next.appName);
  if (!appName) {
    return session;
  }

  const { tracker, lastCapturedAt } = session;

  if (lastCapturedAt === next.capturedAt) {
    if (!tracker.activeApp) {
      return {
        ...session,
        tracker: setActiveWindow(tracker, appName, next.capturedAt),
        lastCapturedAt,
      };
    }
    return session;
  }

  if (lastCapturedAt === null) {
    return {
      ...session,
      tracker: setActiveWindow(tracker, appName, next.capturedAt),
      lastCapturedAt: next.capturedAt,
    };
  }

  return {
    tracker: applyFocusBoundary(tracker, appName, next.capturedAt),
    spans:
      tracker.activeApp && tracker.activeApp !== appName
        ? splitOpenHistorySpan(session.spans, appName, next.capturedAt)
        : session.spans,
    dayEndMs: session.dayEndMs,
    lastCapturedAt: next.capturedAt,
  };
};

export const STALE_INPUT_MS = 5 * 60 * 1000;

export type HistoryLiveCapInput = {
  capturedAt: string;
  idleMs: number;
};

/** Caps live history extension at last user input and/or last agent contact. */
export const resolveHistoryLiveCapMs = (
  host: HistoryLiveCapInput | null,
  agentLastSeenMs: number | null,
  showAgentHint: boolean,
  staleInputMs: number = STALE_INPUT_MS,
): number | null => {
  const idleCapMs =
    host && host.idleMs >= staleInputMs ? Date.parse(host.capturedAt) - host.idleMs : null;
  const agentCapMs = showAgentHint && agentLastSeenMs !== null ? agentLastSeenMs : null;

  if (idleCapMs !== null && agentCapMs !== null) {
    return Math.min(idleCapMs, agentCapMs);
  }

  return idleCapMs ?? agentCapMs;
};

export const projectLiveHistory = (
  tracker: LiveHistoryTracker,
  nowMs: number,
  capNowMs?: number,
): HistoryEntry[] => {
  const display = { ...tracker.totals };
  const effectiveNowMs = capNowMs === undefined ? nowMs : Math.min(nowMs, capNowMs);

  if (tracker.activeApp) {
    const extensionSec = Math.max(0, Math.floor((effectiveNowMs - tracker.liveSinceMs) / 1000));
    display[tracker.activeApp] = (display[tracker.activeApp] ?? 0) + extensionSec;
  }

  return Object.entries(display)
    .flatMap(([appName, durationSec]) => {
      const normalized = normalizeAppName(appName);
      if (!normalized || durationSec <= 0) {
        return [];
      }
      const switchCount = tracker.switches?.[normalized] ?? 0;
      return [
        {
          appName: normalized,
          durationSec,
          ...(switchCount > 0 ? { switchCount } : {}),
        },
      ];
    })
    .sort((a, b) => b.durationSec - a.durationSec);
};
