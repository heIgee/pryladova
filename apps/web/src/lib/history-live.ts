import type { HistoryEntry } from "@pryladova/shared";

const normalizeAppName = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type LiveHistoryTracker = {
  totals: Record<string, number>;
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
  lastCapturedAt: string | null;
};

export const createLiveHistoryTracker = (
  entries: HistoryEntry[],
  snapshotAtMs: number,
  activeApp: string | null,
  activeSince: string | null,
): LiveHistoryTracker => {
  const totals: Record<string, number> = {};

  for (const entry of entries) {
    const appName = normalizeAppName(entry.appName);
    if (!appName) {
      continue;
    }
    totals[appName] = (totals[appName] ?? 0) + entry.durationSec;
  }

  return {
    totals,
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

  if (tracker.activeApp) {
    const extensionSec = Math.max(0, Math.floor((boundaryMs - tracker.liveSinceMs) / 1000));
    totals = { ...tracker.totals };
    totals[tracker.activeApp] = (totals[tracker.activeApp] ?? 0) + extensionSec;
  }

  return {
    totals,
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
): HistorySession => ({
  tracker: createLiveHistoryTracker(
    entries,
    snapshotAtMs,
    telemetry?.appName ?? null,
    telemetry?.capturedAt ?? null,
  ),
  lastCapturedAt: telemetry?.capturedAt ?? null,
});

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
        tracker: setActiveWindow(tracker, appName, next.capturedAt),
        lastCapturedAt,
      };
    }
    return session;
  }

  if (lastCapturedAt === null) {
    return {
      tracker: setActiveWindow(tracker, appName, next.capturedAt),
      lastCapturedAt: next.capturedAt,
    };
  }

  return {
    tracker: applyFocusBoundary(tracker, appName, next.capturedAt),
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
      return [{ appName: normalized, durationSec }];
    })
    .sort((a, b) => b.durationSec - a.durationSec);
};
