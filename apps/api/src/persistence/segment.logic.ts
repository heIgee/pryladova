import { type HistorySpanCloseReason, historySpanCloseReasonSchema } from "@pryladova/shared";
import { z } from "zod";

export const STALE_HEARTBEAT_MS = 5 * 60 * 1000;
export const HEARTBEAT_PERSIST_MS = 30_000;

export type HeartbeatMemory = {
  lastSeenAt: string;
  lastActiveAt: string;
  lastPersistedAt: string | null;
  lastPersistWriteMs: number;
  bootstrapped: boolean;
};

export const createUnbootstrappedHeartbeatMemory = (): HeartbeatMemory => ({
  lastSeenAt: "",
  lastActiveAt: "",
  lastPersistedAt: null,
  lastPersistWriteMs: 0,
  bootstrapped: false,
});

export const resolveLastActiveAt = (
  capturedAt: string,
  idleMs: number,
  staleThresholdMs: number = STALE_HEARTBEAT_MS,
): string => {
  if (idleMs >= staleThresholdMs) {
    return new Date(Date.parse(capturedAt) - idleMs).toISOString();
  }

  return capturedAt;
};

export const createHeartbeatMemoryFromDb = (
  dbLastSeenAt: string | null,
  dbLastActiveAt: string | null,
  capturedAt: string,
  nowMs: number,
): HeartbeatMemory => ({
  lastSeenAt: dbLastSeenAt ?? capturedAt,
  lastActiveAt: dbLastActiveAt ?? dbLastSeenAt ?? capturedAt,
  lastPersistedAt: dbLastSeenAt,
  lastPersistWriteMs: nowMs,
  bootstrapped: true,
});

export const advanceHeartbeatMemory = (
  memory: HeartbeatMemory,
  capturedAt: string,
  nowMs: number,
  options?: { forcePersist?: boolean; idleMs?: number },
): { memory: HeartbeatMemory; previousSeenAt: string; shouldPersist: boolean } => {
  const previousSeenAt = memory.lastSeenAt;
  const lastActiveAt = resolveLastActiveAt(capturedAt, options?.idleMs ?? 0);
  const dirty = memory.lastPersistedAt !== capturedAt || memory.lastActiveAt !== lastActiveAt;
  const shouldPersist =
    dirty &&
    (options?.forcePersist === true || nowMs - memory.lastPersistWriteMs >= HEARTBEAT_PERSIST_MS);

  const next: HeartbeatMemory = {
    ...memory,
    lastSeenAt: capturedAt,
    lastActiveAt,
    lastPersistedAt: shouldPersist ? capturedAt : memory.lastPersistedAt,
    lastPersistWriteMs: shouldPersist ? nowMs : memory.lastPersistWriteMs,
  };

  return { memory: next, previousSeenAt, shouldPersist };
};

export const isStaleHeartbeatGap = (previousIso: string, incomingIso: string): boolean => {
  const gapMs = Date.parse(incomingIso) - Date.parse(previousIso);
  return gapMs > STALE_HEARTBEAT_MS;
};

/**
 * Open-segment time is capped at last_active_at. Heartbeats keep arriving
 * every few seconds while the user is idle, so the last_seen gap stays under
 * five minutes and the stale close never runs. When input resumes, last_active
 * jumps to now and the still-open segment is billed for the whole idle gap.
 * Close at the previous last_active before writing the new heartbeat.
 * Do not use close_and_open_segment for that close: it sets ended_at to now
 * and cements the gap.
 */
export const resolveIdleResumeCloseAt = (
  previousActiveAt: string | null,
  nextActiveAt: string,
): string | null => {
  if (!previousActiveAt) {
    return null;
  }
  if (!isStaleHeartbeatGap(previousActiveAt, nextActiveAt)) {
    return null;
  }
  return previousActiveAt;
};

/**
 * Stale close writes the stored heartbeat time. If that timestamp is earlier
 * than the open segment's started_at, `started_at <= ended_at` matches
 * nothing, the segment stays open, and the next focus change sets ended_at
 * to now. get_interval_summary then bills the whole gap to that app — a
 * Windows Explorer segment opened weeks earlier showed up as ~13h on the day
 * it was finally closed. End the segment at its start so the gap has no
 * duration.
 */
export const resolveStaleSegmentEndAt = (
  segmentStartedAt: string,
  heartbeatEndAt: string,
): string => {
  if (Date.parse(heartbeatEndAt) < Date.parse(segmentStartedAt)) {
    return segmentStartedAt;
  }
  return heartbeatEndAt;
};

/** Last agent contact before a long gap — used to close open segments without cementing downtime. */
/**
 * Host-tick stale close. Idle heartbeats advance last_seen while last_active
 * stays at the last input, so closing at last_seen bills that idle gap.
 * Use the earlier of the two, matching the sweep path.
 */
export const resolveHostTickCloseAt = (
  previousSeenAt: string,
  previousActiveAt: string | null,
  nextActiveAt: string,
  incomingCapturedAt: string,
): string | null => {
  const idleCloseAt = resolveIdleResumeCloseAt(previousActiveAt, nextActiveAt);
  if (idleCloseAt) {
    return idleCloseAt;
  }
  if (!previousSeenAt || !isStaleHeartbeatGap(previousSeenAt, incomingCapturedAt)) {
    return null;
  }
  if (previousActiveAt && Date.parse(previousActiveAt) < Date.parse(previousSeenAt)) {
    return previousActiveAt;
  }
  return previousSeenAt;
};

export const resolveStaleCloseBoundary = (
  persistedLastSeenAt: string | null,
  incomingCapturedAt: string,
): string | null => {
  if (!persistedLastSeenAt) {
    return null;
  }
  if (!isStaleHeartbeatGap(persistedLastSeenAt, incomingCapturedAt)) {
    return null;
  }
  return persistedLastSeenAt;
};

export type IntervalSegmentInput = {
  startedAt: string;
  endedAt: string | null;
};

export type IntervalHeartbeatInput = {
  lastActiveAt: string | null;
  lastSeenAt: string | null;
};

/** Mirrors get_interval_summary duration math for a single segment row. */
export const resolveOpenSegmentEndAt = (
  segment: IntervalSegmentInput,
  heartbeat: IntervalHeartbeatInput | null,
): string =>
  segment.endedAt ?? heartbeat?.lastActiveAt ?? heartbeat?.lastSeenAt ?? segment.startedAt;

export const computeIntervalSegmentDurationSec = (
  segment: IntervalSegmentInput,
  heartbeat: IntervalHeartbeatInput | null,
  range: { start: string; end: string },
): number => {
  const endBoundary = resolveOpenSegmentEndAt(segment, heartbeat);
  const effectiveEndMs = Math.min(Date.parse(endBoundary), Date.parse(range.end));
  const effectiveStartMs = Math.max(Date.parse(segment.startedAt), Date.parse(range.start));
  if (effectiveEndMs <= effectiveStartMs) {
    return 0;
  }

  return Math.floor((effectiveEndMs - effectiveStartMs) / 1000);
};

export type CloseAndOpenResult =
  | { action: "noop"; reason?: "sequence" | "late" }
  | { action: "opened"; segment_id: string };

export const parseCloseAndOpenResult = (value: unknown): CloseAndOpenResult | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const action = "action" in value ? value.action : undefined;
  if (action === "noop") {
    const reason = "reason" in value ? value.reason : undefined;
    if (reason === "sequence" || reason === "late") {
      return { action: "noop", reason };
    }
    return { action: "noop" };
  }

  const segmentId = "segment_id" in value ? value.segment_id : undefined;
  if (action === "opened" && typeof segmentId === "string") {
    return { action: "opened", segment_id: segmentId };
  }

  return null;
};

export type IntervalSummaryRow = {
  app_name: string;
  duration_sec: number;
  switch_count: number;
};

const intervalSummaryRowSchema = z.object({
  app_name: z.string(),
  duration_sec: z.coerce.number(),
  switch_count: z.coerce.number().optional(),
});

export const parseIntervalSummaryRpcResult = (value: unknown): IntervalSummaryRow[] => {
  const parsed = z.array(intervalSummaryRowSchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((row) => ({
    app_name: row.app_name,
    duration_sec: row.duration_sec,
    switch_count: row.switch_count ?? 0,
  }));
};

const HISTORY_SPAN_MERGE_GAP_MS = 1000;

export type HistorySpanSource = {
  app_name: string;
  started_at: string;
  ended_at: string | null;
  close_reason?: string | null;
};

export type BuiltHistorySpan = {
  appName: string;
  startedAt: string;
  endedAt: string;
  open?: true;
  closeReason?: HistorySpanCloseReason;
};

const historySpanSourceSchema = z.object({
  app_name: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable().optional(),
  close_reason: z.string().nullable().optional(),
});

export const parseHistorySpanSources = (value: unknown): HistorySpanSource[] => {
  const parsed = z.array(historySpanSourceSchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((row) => ({
    app_name: row.app_name,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    close_reason: row.close_reason ?? null,
  }));
};

const historySpanHeartbeatSchema = z.object({
  last_active_at: z.string().nullable().optional(),
  last_seen_at: z.string().nullable().optional(),
});

export const parseHistorySpanHeartbeat = (value: unknown): IntervalHeartbeatInput | null => {
  const parsed = historySpanHeartbeatSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return {
    lastActiveAt: parsed.data.last_active_at ?? null,
    lastSeenAt: parsed.data.last_seen_at ?? null,
  };
};

/** Clip overlapping segments to one local day and collapse title changes inside an app. */
export const buildHistorySpans = (
  rows: HistorySpanSource[],
  heartbeat: IntervalHeartbeatInput | null,
  range: { start: string; end: string },
): BuiltHistorySpan[] => {
  const rangeStartMs = Date.parse(range.start);
  const rangeEndMs = Date.parse(range.end);
  if (
    !Number.isFinite(rangeStartMs) ||
    !Number.isFinite(rangeEndMs) ||
    rangeEndMs <= rangeStartMs
  ) {
    return [];
  }

  const clipped = rows
    .flatMap((row) => {
      const appName = row.app_name.trim();
      const startMs = Date.parse(row.started_at);
      if (!appName || !Number.isFinite(startMs)) {
        return [];
      }

      const rawEnd = resolveOpenSegmentEndAt(
        { startedAt: row.started_at, endedAt: row.ended_at },
        heartbeat,
      );
      const rawEndMs = Date.parse(rawEnd);
      if (!Number.isFinite(rawEndMs)) {
        return [];
      }

      const start = Math.max(startMs, rangeStartMs);
      const end = Math.min(rawEndMs, rangeEndMs);
      if (end <= start) {
        return [];
      }

      // A reason only describes the visible end when the range did not clip it.
      const closeReason =
        row.ended_at !== null && rawEndMs <= rangeEndMs
          ? historySpanCloseReasonSchema.safeParse(row.close_reason).data
          : undefined;

      return [
        {
          appName,
          startMs: start,
          endMs: end,
          open: row.ended_at === null && end < rangeEndMs,
          closeReason,
        },
      ];
    })
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  const merged: typeof clipped = [];
  for (const slice of clipped) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.appName === slice.appName &&
      slice.startMs - previous.endMs <= HISTORY_SPAN_MERGE_GAP_MS
    ) {
      if (slice.endMs >= previous.endMs) {
        previous.endMs = slice.endMs;
        previous.closeReason = slice.closeReason;
      }
      previous.open = slice.open;
      continue;
    }
    merged.push({ ...slice });
  }

  return merged.map((slice) => ({
    appName: slice.appName,
    startedAt: new Date(slice.startMs).toISOString(),
    endedAt: new Date(slice.endMs).toISOString(),
    ...(slice.open ? { open: true as const } : {}),
    ...(slice.closeReason && !slice.open ? { closeReason: slice.closeReason } : {}),
  }));
};

export const mapIntervalSummaryRows = (
  rows: IntervalSummaryRow[],
): { appName: string; durationSec: number; switchCount?: number }[] =>
  rows.flatMap((row) => {
    const appName = row.app_name.trim();
    if (!appName) {
      return [];
    }

    return [
      {
        appName,
        durationSec: row.duration_sec,
        ...(row.switch_count > 0 ? { switchCount: row.switch_count } : {}),
      },
    ];
  });

export type SerializedRunner = <T>(key: string, fn: () => Promise<T>) => Promise<T>;

/** Per-key promise chain — one in-flight mutation at a time per agent. */
export const createSerializedRunner = (): SerializedRunner => {
  const chains = new Map<string, Promise<unknown>>();

  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = chains.get(key) ?? Promise.resolve();
    // Ignore prior per-agent failures so the next mutation still runs in order.
    const next = previous.catch(() => {}).then(fn);
    chains.set(key, next);
    return next.finally(() => {
      if (chains.get(key) === next) {
        chains.delete(key);
      }
    });
  };
};
