import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { TelemetryPayload, WindowClassification } from "@pryladova/shared";
import {
  formatPersistenceError,
  isPermissionDeniedError,
  isSchemaMissingError,
  PERMISSION_DENIED_MESSAGE,
  SCHEMA_MISSING_MESSAGE,
} from "@pryladova/shared";
import {
  advanceHeartbeatMemory,
  createHeartbeatMemoryFromDb,
  createSerializedRunner,
  createUnbootstrappedHeartbeatMemory,
  type HeartbeatMemory,
  parseCloseAndOpenResult,
  resolveHostTickCloseAt,
  resolveIdleResumeCloseAt,
  resolveStaleCloseBoundary,
  resolveStaleSegmentEndAt,
  STALE_HEARTBEAT_MS,
} from "./segment.logic.js";
import { SupabaseService } from "./supabase.service.js";

type CloseReason = "focus_change" | "stale" | "shutdown" | "lock";
type SegmentCloseOutcome = "closed" | "unchanged";

export type HostTickOptions = {
  /** Focus-change ingest closes segments via RPC; stale detection must not race it. */
  skipStaleClose?: boolean;
  /** Persist heartbeat immediately (shutdown / API drain). */
  forcePersist?: boolean;
  idleMs?: number;
  /** Re-open this app after an idle gap is closed, so post-resume time is counted. */
  appName?: string;
  windowTitle?: string;
  /** Agent idempotency key. A sequence already applied does not move the open segment. */
  sequence?: number;
};

const readAppliedSequence = (data: unknown): number => {
  if (!data || typeof data !== "object" || !("sequence" in data) || data.sequence == null) {
    return 0;
  }
  const raw = data.sequence;
  let parsed = Number.NaN;
  if (typeof raw === "number") {
    parsed = raw;
  } else if (typeof raw === "string") {
    parsed = Number(raw);
  }
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Invalid agent_event_sequences.sequence");
  }
  return parsed;
};

@Injectable()
export class SegmentService implements OnApplicationShutdown {
  private readonly logger = new Logger(SegmentService.name);
  private schemaMissingLogged = false;
  private readonly runSegmentMutation = createSerializedRunner();
  private readonly heartbeatMemory = new Map<string, HeartbeatMemory>();
  private readonly appliedSequence = new Map<string, number>();

  constructor(private readonly supabaseService: SupabaseService) {}

  async onApplicationShutdown(): Promise<void> {
    await this.flushHeartbeats();
  }

  private logPersistenceFailure(context: string, error: unknown): void {
    const detail = formatPersistenceError(error);
    if (isSchemaMissingError(detail)) {
      if (!this.schemaMissingLogged) {
        this.schemaMissingLogged = true;
        this.logger.warn(`[persistence] ${SCHEMA_MISSING_MESSAGE}`);
      }
      return;
    }
    if (isPermissionDeniedError(detail)) {
      if (!this.schemaMissingLogged) {
        this.schemaMissingLogged = true;
        this.logger.warn(`[persistence] ${PERMISSION_DENIED_MESSAGE}`);
      }
      return;
    }
    this.logger.warn(`[persistence] ${context} failed: ${detail}`);
  }

  async onFocusChange(
    agentId: string,
    telemetry: TelemetryPayload,
    sequence?: number,
  ): Promise<string | undefined> {
    if (!this.supabaseService.isConfigured()) {
      return undefined;
    }

    return this.runSegmentMutation(agentId, async () => {
      try {
        if (sequence !== undefined && (await this.isSequenceApplied(agentId, sequence))) {
          return undefined;
        }

        const persistedHeartbeat = await this.readPersistedHeartbeat(agentId);
        const openStartedAt = await this.readOpenSegmentStart(agentId);
        const idleCloseAt = resolveIdleResumeCloseAt(
          persistedHeartbeat?.lastActiveAt ?? null,
          telemetry.capturedAt,
        );
        const staleBoundary = resolveStaleCloseBoundary(
          persistedHeartbeat?.lastSeenAt ?? null,
          telemetry.capturedAt,
        );
        const heartbeatEnd =
          idleCloseAt ??
          (staleBoundary ? (persistedHeartbeat?.lastActiveAt ?? staleBoundary) : null);
        // Close before close_and_open_segment. That RPC sets ended_at to the
        // new focus time, which bills an unclosed downtime gap to this app.
        // A fresh heartbeat means the open span is real, however long it is.
        if (heartbeatEnd) {
          const endAt = openStartedAt
            ? resolveStaleSegmentEndAt(openStartedAt, heartbeatEnd)
            : heartbeatEnd;
          const closed = await this.closeOpenSegmentUnlocked(agentId, endAt, "stale");
          if (closed !== "closed") {
            return undefined;
          }
        }

        const client = this.supabaseService.getClient();
        const { data, error } = await client.rpc("close_and_open_segment", {
          p_agent_id: agentId,
          p_captured_at: telemetry.capturedAt,
          p_app_name: telemetry.appName,
          p_window_title: telemetry.windowTitle,
          ...(sequence !== undefined ? { p_sequence: sequence } : {}),
        });

        if (error) {
          throw error;
        }

        const parsed = parseCloseAndOpenResult(data);
        if (!parsed) {
          this.logger.warn("[persistence] unexpected close_and_open_segment result");
          return undefined;
        }

        if (sequence !== undefined) {
          this.rememberSequence(agentId, sequence);
        }

        if (parsed.action === "noop") {
          if (parsed.reason !== "sequence") {
            this.logger.warn(
              `[persistence] ignored late focus change for agent ${agentId} at ${telemetry.capturedAt}`,
            );
          }
          return undefined;
        }

        return parsed.segment_id;
      } catch (error: unknown) {
        this.logPersistenceFailure("onFocusChange", error);
        throw error instanceof Error ? error : new Error("onFocusChange failed", { cause: error });
      }
    });
  }

  async closeForAgentDisconnect(agentId: string): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    const memory = this.heartbeatMemory.get(agentId);
    const persisted = memory?.bootstrapped
      ? { lastSeenAt: memory.lastSeenAt, lastActiveAt: memory.lastActiveAt }
      : await this.readPersistedHeartbeat(agentId);
    const endedAt = persisted?.lastActiveAt ?? persisted?.lastSeenAt;
    if (!endedAt) {
      return;
    }

    await this.closeOpenSegmentAt(agentId, endedAt, "stale");
  }

  async onHostTick(agentId: string, capturedAt: string, options?: HostTickOptions): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      if (
        options?.sequence !== undefined &&
        (await this.isSequenceApplied(agentId, options.sequence))
      ) {
        return;
      }

      let memory = this.heartbeatMemory.get(agentId) ?? createUnbootstrappedHeartbeatMemory();
      if (!memory.bootstrapped) {
        memory = await this.bootstrapHeartbeatMemory(agentId, capturedAt);
      }

      const nowMs = Date.now();
      const previousActiveAt = memory.lastActiveAt || null;
      const {
        memory: nextMemory,
        previousSeenAt,
        shouldPersist,
      } = advanceHeartbeatMemory(memory, capturedAt, nowMs, {
        forcePersist: options?.forcePersist,
        idleMs: options?.idleMs,
      });
      this.heartbeatMemory.set(agentId, nextMemory);

      let sequenceClaimed = false;
      if (!options?.skipStaleClose) {
        const closeAt = resolveHostTickCloseAt(
          previousSeenAt,
          previousActiveAt,
          nextMemory.lastActiveAt,
          capturedAt,
        );
        if (closeAt) {
          sequenceClaimed = await this.closeStaleAndReopen(agentId, closeAt, capturedAt, options);
        }
      }

      if (shouldPersist) {
        await this.persistHeartbeat(agentId, nextMemory);
      }

      if (options?.sequence !== undefined) {
        if (!sequenceClaimed) {
          await this.claimSequence(agentId, options.sequence);
        }
        this.rememberSequence(agentId, options.sequence);
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("onHostTick", error);
      throw error instanceof Error ? error : new Error("onHostTick failed", { cause: error });
    }
  }

  async flushHeartbeats(agentId?: string): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    const agentIds = agentId ? [agentId] : [...this.heartbeatMemory.keys()];
    for (const id of agentIds) {
      const memory = this.heartbeatMemory.get(id);
      if (!memory || memory.lastPersistedAt === memory.lastSeenAt) {
        continue;
      }

      try {
        // biome-ignore lint/performance/noAwaitInLoops: heartbeats persist one agent at a time
        await this.persistHeartbeat(id, memory);
        this.heartbeatMemory.set(id, {
          ...memory,
          lastPersistedAt: memory.lastSeenAt,
          lastPersistWriteMs: Date.now(),
        });
      } catch (error: unknown) {
        this.logPersistenceFailure("flushHeartbeats", error);
      }
    }
  }

  private async readPersistedHeartbeat(
    agentId: string,
  ): Promise<{ lastSeenAt: string; lastActiveAt: string } | null> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from("agent_heartbeats")
      .select("last_seen_at, last_active_at")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.last_seen_at || !data.last_active_at) {
      return null;
    }

    return {
      lastSeenAt: data.last_seen_at,
      lastActiveAt: data.last_active_at,
    };
  }

  private async readOpenSegmentStart(agentId: string): Promise<string | null> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from("window_segments")
      .select("started_at")
      .eq("agent_id", agentId)
      .is("ended_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.started_at ?? null;
  }

  private async openSegmentAt(
    agentId: string,
    startedAt: string,
    appName: string,
    windowTitle: string,
  ): Promise<void> {
    const client = this.supabaseService.getClient();
    const { error } = await client.rpc("open_window_segment", {
      p_agent_id: agentId,
      p_started_at: startedAt,
      p_app_name: appName,
      p_window_title: windowTitle,
    });

    if (error) {
      throw error;
    }
  }

  private async bootstrapHeartbeatMemory(
    agentId: string,
    capturedAt: string,
  ): Promise<HeartbeatMemory> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from("agent_heartbeats")
      .select("last_seen_at, last_active_at")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return createHeartbeatMemoryFromDb(
      data?.last_seen_at ?? null,
      data?.last_active_at ?? null,
      capturedAt,
      Date.now(),
    );
  }

  private async persistHeartbeat(agentId: string, memory: HeartbeatMemory): Promise<void> {
    const client = this.supabaseService.getClient();
    const { error } = await client.from("agent_heartbeats").upsert({
      agent_id: agentId,
      last_seen_at: memory.lastSeenAt,
      last_active_at: memory.lastActiveAt,
    });

    if (error) {
      throw error;
    }
  }

  async updateClassification(
    segmentId: string | undefined,
    classification: WindowClassification | null,
  ): Promise<void> {
    if (!segmentId || !classification || !this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client
        .from("window_segments")
        .update({ classification })
        .eq("id", segmentId);

      if (error) {
        throw error;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("updateClassification", error);
    }
  }

  async updateOpenSegmentClassification(
    agentId: string | undefined,
    classification: WindowClassification | null,
  ): Promise<void> {
    if (!agentId || !classification || !this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client
        .from("window_segments")
        .update({ classification })
        .eq("agent_id", agentId)
        .is("ended_at", null);

      if (error) {
        throw error;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("updateOpenSegmentClassification", error);
    }
  }

  async closeForShutdown(agentId: string, capturedAt: string, sequence?: number): Promise<void> {
    if (await this.sequenceAlreadyApplied(agentId, sequence, "closeForShutdown")) {
      return;
    }
    try {
      await this.onHostTick(agentId, capturedAt, { skipStaleClose: true, forcePersist: true });
    } finally {
      await this.closeOpenSegmentAt(agentId, capturedAt, "shutdown", sequence);
    }
  }

  async closeForSessionLock(agentId: string, capturedAt: string, sequence?: number): Promise<void> {
    if (await this.sequenceAlreadyApplied(agentId, sequence, "closeForSessionLock")) {
      return;
    }
    try {
      await this.onHostTick(agentId, capturedAt, { skipStaleClose: true, forcePersist: true });
    } finally {
      await this.closeOpenSegmentAt(agentId, capturedAt, "lock", sequence);
    }
  }

  @Interval(60_000)
  async sweepStaleHeartbeats(): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const cutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
      const { error } = await client.rpc("sweep_stale_segments", { p_cutoff: cutoff });

      if (error) {
        throw error;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("sweepStaleHeartbeats", error);
    }
  }

  private rememberSequence(agentId: string, sequence: number): void {
    const current = this.appliedSequence.get(agentId) ?? 0;
    if (sequence > current) {
      this.appliedSequence.set(agentId, sequence);
    }
  }

  private async readMaxAppliedSequence(agentId: string): Promise<number> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from("agent_event_sequences")
      .select("sequence")
      .eq("agent_id", agentId)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return readAppliedSequence(data);
  }

  private async isSequenceApplied(agentId: string, sequence: number): Promise<boolean> {
    let last = this.appliedSequence.get(agentId);
    if (last === undefined) {
      last = await this.readMaxAppliedSequence(agentId);
      const current = this.appliedSequence.get(agentId);
      if (current === undefined) {
        this.appliedSequence.set(agentId, last);
      } else {
        last = current;
      }
    }
    return sequence <= last;
  }

  private async sequenceAlreadyApplied(
    agentId: string,
    sequence: number | undefined,
    context: string,
  ): Promise<boolean> {
    if (sequence === undefined || !this.supabaseService.isConfigured()) {
      return false;
    }
    try {
      return await this.isSequenceApplied(agentId, sequence);
    } catch (error: unknown) {
      this.logPersistenceFailure(context, error);
      return false;
    }
  }

  private async claimSequence(agentId: string, sequence: number): Promise<boolean> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client.rpc("claim_agent_sequence", {
      p_agent_id: agentId,
      p_sequence: sequence,
    });
    if (error) {
      throw error;
    }
    if (typeof data !== "boolean") {
      throw new Error("unexpected claim_agent_sequence result");
    }
    return data;
  }

  private async closeStaleAndReopen(
    agentId: string,
    closeAt: string,
    capturedAt: string,
    options: HostTickOptions | undefined,
  ): Promise<boolean> {
    let claimed = false;
    await this.runSegmentMutation(agentId, async () => {
      const openStartedAt = await this.readOpenSegmentStart(agentId);
      // A focus change that just opened this segment already handled the gap.
      // An older segment whose start is after the heartbeat end still needs the clamp.
      if (
        openStartedAt &&
        Date.parse(openStartedAt) >= Date.parse(capturedAt) &&
        Date.parse(closeAt) < Date.parse(openStartedAt)
      ) {
        return;
      }
      const outcome = await this.closeOpenSegmentUnlocked(
        agentId,
        closeAt,
        "stale",
        options?.sequence,
      );
      if (options?.sequence !== undefined) {
        claimed = true;
      }
      if (outcome !== "closed" || !options?.appName) {
        return;
      }
      const stillOpen = await this.readOpenSegmentStart(agentId);
      if (stillOpen) {
        return;
      }
      await this.openSegmentAt(agentId, capturedAt, options.appName, options.windowTitle ?? "");
    });
    return claimed;
  }

  private async closeOpenSegmentAt(
    agentId: string,
    endedAt: string,
    closeReason: CloseReason,
    sequence?: number,
  ): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    await this.runSegmentMutation(agentId, async () => {
      if (await this.sequenceAlreadyApplied(agentId, sequence, "closeOpenSegmentAt")) {
        return;
      }
      await this.closeOpenSegmentUnlocked(agentId, endedAt, closeReason, sequence);
      if (sequence !== undefined) {
        this.rememberSequence(agentId, sequence);
      }
    });
  }

  private async closeOpenSegmentUnlocked(
    agentId: string,
    endedAt: string,
    closeReason: CloseReason,
    sequence?: number,
  ): Promise<SegmentCloseOutcome> {
    try {
      const client = this.supabaseService.getClient();
      const openStartedAt = await this.readOpenSegmentStart(agentId);
      const endAt = openStartedAt ? resolveStaleSegmentEndAt(openStartedAt, endedAt) : endedAt;
      const { data, error } = await client.rpc("close_open_segment", {
        p_agent_id: agentId,
        p_ended_at: endAt,
        p_close_reason: closeReason,
        ...(sequence !== undefined ? { p_sequence: sequence } : {}),
      });

      if (error) {
        throw error;
      }
      return data === true ? "closed" : "unchanged";
    } catch (error: unknown) {
      this.logPersistenceFailure("closeOpenSegmentAt", error);
      throw error instanceof Error
        ? error
        : new Error("closeOpenSegmentAt failed", { cause: error });
    }
  }
}
