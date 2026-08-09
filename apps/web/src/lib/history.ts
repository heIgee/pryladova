import {
  HISTORY_ROUTE,
  type HistoryEntry,
  type HistoryResponse,
  historyResponseSchema,
} from "@pryladova/shared";
import { readApiErrorMessage } from "./api-error.js";
import { apiFetch } from "./api-fetch.js";

export const HISTORY_VISIBLE_LIMIT = 8;

export type HistoryOtherBucket = {
  appCount: number;
  durationSec: number;
};

export type HistoryPartition = {
  visible: HistoryEntry[];
  other: HistoryOtherBucket | null;
};

export const summarizeHistoryEntries = (
  entries: HistoryEntry[],
): { totalDurationSec: number; appCount: number } => ({
  totalDurationSec: entries.reduce((sum, entry) => sum + entry.durationSec, 0),
  appCount: entries.length,
});

export const partitionHistoryEntries = (
  entries: HistoryEntry[],
  options: {
    limit?: number;
    activeAppName?: string | null;
    expanded?: boolean;
  } = {},
): HistoryPartition => {
  const limit = options.limit ?? HISTORY_VISIBLE_LIMIT;
  const expanded = options.expanded ?? false;
  const activeAppName = options.activeAppName ?? null;

  if (expanded || entries.length <= limit) {
    return { visible: entries, other: null };
  }

  const topByDuration = entries.slice(0, limit);
  const activeEntry = activeAppName
    ? entries.find((entry) => entry.appName === activeAppName)
    : undefined;

  let visible: HistoryEntry[];
  if (activeEntry && !topByDuration.some((entry) => entry.appName === activeAppName)) {
    const withoutActive = entries.filter((entry) => entry.appName !== activeAppName);
    visible = [activeEntry, ...withoutActive.slice(0, limit - 1)];
  } else {
    visible = topByDuration;
  }

  const visibleNames = new Set(visible.map((entry) => entry.appName));
  const hidden = entries.filter((entry) => !visibleNames.has(entry.appName));
  if (hidden.length === 0) {
    return { visible, other: null };
  }

  return {
    visible,
    other: {
      appCount: hidden.length,
      durationSec: hidden.reduce((sum, entry) => sum + entry.durationSec, 0),
    },
  };
};

export const formatDurationSec = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
};

export const localDayUtcRange = (date = new Date()): { from: string; to: string } => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};

export const formatLocalDayLabel = (date = new Date()): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);

export const fetchHistory = async (from: string, to: string): Promise<HistoryResponse> => {
  const params = new URLSearchParams({ from, to });
  const response = await apiFetch(`${HISTORY_ROUTE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }
  const json: unknown = await response.json();
  return historyResponseSchema.parse(json);
};
