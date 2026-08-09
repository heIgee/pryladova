import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { TelemetryPayload, WindowClassification } from "@pryladova/shared";
import {
  formatPersistenceError,
  isPermissionDeniedError,
  isSchemaMissingError,
  PERMISSION_DENIED_MESSAGE,
  SCHEMA_MISSING_MESSAGE,
} from "./persistence-error.js";
import {
  advanceHeartbeatMemory,
  createHeartbeatMemoryFromDb,
  createSerializedRunner,
  createUnbootstrappedHeartbeatMemory,
  type HeartbeatMemory,
  isStaleHeartbeatGap,
  parseCloseAndOpenResult,
  resolveStaleCloseBoundary,
  STALE_HEARTBEAT_MS,
} from "./segment.logic.js";
import { SupabaseService } from "./supabase.service.js";

type CloseReason = "focus_change" | "stale" | "shutdown";

export type HostTickOptions = {
  /** Focus-change ingest closes segments via RPC; stale detection must not race it. */
  skipStaleClose?: boolean;
  /** Persist heartbeat immediately (shutdown / API drain). */
  forcePersist?: boolean;
  idleMs?: number;
};

@Injectable()
export class SegmentService implements OnApplicationShutdown {
  private readonly logger = new Logger(SegmentService.name);
  private schemaMissingLogged = false;
  private readonly runSegmentMutation = createSerializedRunner();
  private readonly heartbeatMemory = new Map<string, HeartbeatMemory>();

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

  async onFocusChange(agentId: string, telemetry: TelemetryPayload): Promise<string | undefined> {
    if (!this.supabaseService.isConfigured()) {
      return undefined;
    }

    return this.runSegmentMutation(agentId, async () => {
      try {
        const persistedHeartbeat = await this.readPersistedHeartbeat(agentId);
        const staleBoundary = resolveStaleCloseBoundary(
          persistedHeartbeat?.lastSeenAt ?? null,
          telemetry.capturedAt,
        );
        if (staleBoundary) {
          await this.closeOpenSegmentUnlocked(
            agentId,
            persistedHeartbeat?.lastActiveAt ?? staleBoundary,
            "stale",
          );
        }

        const client = this.supabaseService.getClient();
        const { data, error } = await client.rpc("close_and_open_segment", {
          p_agent_id: agentId,
          p_captured_at: telemetry.capturedAt,
          p_app_name: telemetry.appName,
          p_window_title: telemetry.windowTitle,
        });

        if (error) {
          throw error;
        }

        const parsed = parseCloseAndOpenResult(data);
        if (!parsed) {
          this.logger.warn("[persistence] unexpected close_and_open_segment result");
          return undefined;
        }

        if (parsed.action === "noop") {
          this.logger.warn(
            `[persistence] ignored late focus change for agent ${agentId} at ${telemetry.capturedAt}`,
          );
          return undefined;
        }

        return parsed.segment_id;
      } catch (error: unknown) {
        this.logPersistenceFailure("onFocusChange", error);
        return undefined;
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
      let memory = this.heartbeatMemory.get(agentId) ?? createUnbootstrappedHeartbeatMemory();
      if (!memory.bootstrapped) {
        memory = await this.bootstrapHeartbeatMemory(agentId, capturedAt);
      }

      const nowMs = Date.now();
      const {
        memory: nextMemory,
        previousSeenAt,
        shouldPersist,
      } = advanceHeartbeatMemory(memory, capturedAt, nowMs, {
        forcePersist: options?.forcePersist,
        idleMs: options?.idleMs,
      });
      this.heartbeatMemory.set(agentId, nextMemory);

      if (
        !options?.skipStaleClose &&
        previousSeenAt &&
        isStaleHeartbeatGap(previousSeenAt, capturedAt)
      ) {
        await this.closeOpenSegmentAt(agentId, previousSeenAt, "stale");
      }

      if (shouldPersist) {
        await this.persistHeartbeat(agentId, nextMemory);
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("onHostTick", error);
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

  async closeForShutdown(agentId: string, capturedAt: string): Promise<void> {
    await this.onHostTick(agentId, capturedAt, { skipStaleClose: true, forcePersist: true });
    await this.closeOpenSegmentAt(agentId, capturedAt, "shutdown");
  }

  /** Requires a single API container — duplicate sweeps if horizontally scaled. */
  @Interval(60_000)
  async sweepStaleHeartbeats(): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const cutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
      const { data: heartbeats, error } = await client
        .from("agent_heartbeats")
        .select("agent_id, last_seen_at, last_active_at")
        .lt("last_seen_at", cutoff);

      if (error) {
        throw error;
      }

      for (const heartbeat of heartbeats ?? []) {
        await this.closeOpenSegmentAt(
          heartbeat.agent_id,
          heartbeat.last_active_at ?? heartbeat.last_seen_at,
          "stale",
        );
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("sweepStaleHeartbeats", error);
    }
  }

  private async closeOpenSegmentAt(
    agentId: string,
    endedAt: string,
    closeReason: CloseReason,
  ): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    await this.runSegmentMutation(agentId, async () => {
      await this.closeOpenSegmentUnlocked(agentId, endedAt, closeReason);
    });
  }

  private async closeOpenSegmentUnlocked(
    agentId: string,
    endedAt: string,
    closeReason: CloseReason,
  ): Promise<void> {
    try {
      const client = this.supabaseService.getClient();
      const { error } = await client
        .from("window_segments")
        .update({ ended_at: endedAt, close_reason: closeReason })
        .eq("agent_id", agentId)
        .is("ended_at", null)
        .lte("started_at", endedAt);

      if (error) {
        throw error;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("closeOpenSegmentAt", error);
    }
  }
}
