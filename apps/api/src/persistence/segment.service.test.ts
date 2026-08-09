import type { TelemetryPayload } from "@pryladova/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_PERSIST_MS } from "./segment.logic.js";
import { SegmentService } from "./segment.service.js";
import type { SupabaseService } from "./supabase.service.js";

const STALE_PREVIOUS = "2026-01-01T12:00:00.000Z";
const STALE_INCOMING = "2026-01-01T12:06:00.000Z";

const telemetry = (capturedAt: string, appName: string): TelemetryPayload => ({
  capturedAt,
  appName,
  windowTitle: "title",
});

const createHeartbeatClient = (options?: {
  dbLastSeenAt?: string | null;
  windowSegmentsUpdate?: ReturnType<typeof vi.fn>;
}) => {
  const heartbeatsSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data:
          options?.dbLastSeenAt === undefined
            ? { last_seen_at: STALE_PREVIOUS, last_active_at: STALE_PREVIOUS }
            : options.dbLastSeenAt === null
              ? null
              : {
                  last_seen_at: options.dbLastSeenAt,
                  last_active_at: options.dbLastSeenAt,
                },
        error: null,
      }),
    }),
  });
  const heartbeatsUpsert = vi.fn().mockResolvedValue({ error: null });
  const windowSegmentsUpdate =
    options?.windowSegmentsUpdate ??
    vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

  const client = {
    from: vi.fn((table: string) => {
      if (table === "agent_heartbeats") {
        return {
          select: heartbeatsSelect,
          upsert: heartbeatsUpsert,
        };
      }
      if (table === "window_segments") {
        return { update: windowSegmentsUpdate };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  const supabaseService = {
    isConfigured: () => true,
    getClient: () => client,
  } as unknown as SupabaseService;

  return {
    service: new SegmentService(supabaseService),
    heartbeatsSelect,
    heartbeatsUpsert,
    windowSegmentsUpdate,
  };
};

const createFocusChangeService = (rpc: ReturnType<typeof vi.fn>): SegmentService => {
  const heartbeatsSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  });
  const client = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "agent_heartbeats") {
        return { select: heartbeatsSelect };
      }
      throw new Error(`unexpected from() call: ${table}`);
    }),
  };

  const supabaseService = {
    isConfigured: () => true,
    getClient: () => client,
  } as unknown as SupabaseService;

  return new SegmentService(supabaseService);
};

describe("SegmentService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips stale close on host tick when focus change owns segment boundaries", async () => {
    const lte = vi.fn().mockResolvedValue({ error: null });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({ lte }),
      }),
    });
    const { service, heartbeatsUpsert } = createHeartbeatClient({ windowSegmentsUpdate });

    await service.onHostTick("desk-pc", STALE_INCOMING, { skipStaleClose: true });

    expect(windowSegmentsUpdate).not.toHaveBeenCalled();
    expect(heartbeatsUpsert).not.toHaveBeenCalled();
  });

  it("closes a stale open segment before focus-change RPC after a long agent gap", async () => {
    const lte = vi.fn().mockResolvedValue({ error: null });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({ lte }),
      }),
    });
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { last_seen_at: STALE_PREVIOUS, last_active_at: STALE_PREVIOUS },
          error: null,
        }),
      }),
    });
    const rpc = vi.fn().mockResolvedValue({
      data: { action: "opened", segment_id: "seg-1" },
      error: null,
    });

    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { update: windowSegmentsUpdate };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = {
      isConfigured: () => true,
      getClient: () => client,
    } as unknown as SupabaseService;

    const service = new SegmentService(supabaseService);
    await service.onFocusChange("desk-pc", telemetry(STALE_INCOMING, "Cursor"));

    expect(windowSegmentsUpdate).toHaveBeenCalledWith({
      ended_at: STALE_PREVIOUS,
      close_reason: "stale",
    });
    expect(rpc).toHaveBeenCalled();
  });

  it("closes open segments at last active time when the agent disconnects", async () => {
    const lte = vi.fn().mockResolvedValue({ error: null });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({ lte }),
      }),
    });
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            last_seen_at: "2026-08-09T09:00:00.000Z",
            last_active_at: "2026-08-08T22:05:00.000Z",
          },
          error: null,
        }),
      }),
    });

    const client = {
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { update: windowSegmentsUpdate };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = {
      isConfigured: () => true,
      getClient: () => client,
    } as unknown as SupabaseService;

    const service = new SegmentService(supabaseService);
    await service.closeForAgentDisconnect("desk-pc");

    expect(windowSegmentsUpdate).toHaveBeenCalledWith({
      ended_at: "2026-08-08T22:05:00.000Z",
      close_reason: "stale",
    });
  });

  it("persists last_active_at at last input while last_seen_at advances during idle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T22:00:00.000Z"));

    const { service, heartbeatsUpsert } = createHeartbeatClient({
      dbLastSeenAt: "2026-08-08T22:00:00.000Z",
    });

    await service.onHostTick("desk-pc", "2026-08-08T22:00:00.000Z", { idleMs: 0 });
    expect(heartbeatsUpsert).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HEARTBEAT_PERSIST_MS);
    await service.onHostTick("desk-pc", "2026-08-09T09:00:00.000Z", {
      idleMs: 11 * 60 * 60 * 1000,
    });

    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-08-09T09:00:00.000Z",
      last_active_at: "2026-08-08T22:00:00.000Z",
    });
  });

  it("closes stale open segments on host-only ticks after a long gap", async () => {
    const lte = vi.fn().mockResolvedValue({ error: null });
    const is = vi.fn().mockReturnValue({ lte });
    const eq = vi.fn().mockReturnValue({ is });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({ eq });
    const { service, heartbeatsUpsert } = createHeartbeatClient({ windowSegmentsUpdate });

    await service.onHostTick("desk-pc", STALE_INCOMING);

    expect(windowSegmentsUpdate).toHaveBeenCalledWith({
      ended_at: STALE_PREVIOUS,
      close_reason: "stale",
    });
    expect(lte).toHaveBeenCalledWith("started_at", STALE_PREVIOUS);
    expect(heartbeatsUpsert).not.toHaveBeenCalled();
  });

  it("debounces heartbeat upserts and persists after 30 seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const { service, heartbeatsSelect, heartbeatsUpsert } = createHeartbeatClient({
      dbLastSeenAt: "2026-01-01T12:00:00.000Z",
    });

    await service.onHostTick("desk-pc", "2026-01-01T12:00:02.000Z");
    expect(heartbeatsSelect).toHaveBeenCalledTimes(1);
    expect(heartbeatsUpsert).not.toHaveBeenCalled();

    await service.onHostTick("desk-pc", "2026-01-01T12:00:04.000Z");
    expect(heartbeatsSelect).toHaveBeenCalledTimes(1);
    expect(heartbeatsUpsert).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HEARTBEAT_PERSIST_MS);
    await service.onHostTick("desk-pc", "2026-01-01T12:00:32.000Z");

    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-01-01T12:00:32.000Z",
      last_active_at: "2026-01-01T12:00:32.000Z",
    });
  });

  it("flushes pending heartbeats on shutdown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const lte = vi.fn().mockResolvedValue({ error: null });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({ lte }),
      }),
    });
    const { service, heartbeatsUpsert } = createHeartbeatClient({ windowSegmentsUpdate });

    await service.onHostTick("desk-pc", "2026-01-01T12:00:02.000Z");
    expect(heartbeatsUpsert).not.toHaveBeenCalled();

    await service.closeForShutdown("desk-pc", "2026-01-01T12:00:04.000Z");

    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-01-01T12:00:04.000Z",
      last_active_at: "2026-01-01T12:00:04.000Z",
    });
    expect(windowSegmentsUpdate).toHaveBeenCalledWith({
      ended_at: "2026-01-01T12:00:04.000Z",
      close_reason: "shutdown",
    });
  });

  it("flushes all dirty heartbeats on application shutdown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const { service, heartbeatsUpsert } = createHeartbeatClient({
      dbLastSeenAt: "2026-01-01T12:00:00.000Z",
    });

    await service.onHostTick("desk-pc", "2026-01-01T12:00:02.000Z");
    await service.onHostTick("laptop", "2026-01-01T12:00:03.000Z");
    expect(heartbeatsUpsert).not.toHaveBeenCalled();

    await service.onApplicationShutdown();

    expect(heartbeatsUpsert).toHaveBeenCalledTimes(2);
    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-01-01T12:00:02.000Z",
      last_active_at: "2026-01-01T12:00:02.000Z",
    });
    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "laptop",
      last_seen_at: "2026-01-01T12:00:03.000Z",
      last_active_at: "2026-01-01T12:00:03.000Z",
    });
  });

  it("closes open segments for stale heartbeats from the sweep job", async () => {
    const lte = vi.fn().mockResolvedValue({ error: null });
    const is = vi.fn().mockReturnValue({ lte });
    const eq = vi.fn().mockReturnValue({ is });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({ eq });
    const lt = vi.fn().mockResolvedValue({
      data: [{ agent_id: "desk-pc", last_seen_at: STALE_PREVIOUS }],
      error: null,
    });
    const heartbeatsSelect = vi.fn().mockReturnValue({ lt });

    const client = {
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { update: windowSegmentsUpdate };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = {
      isConfigured: () => true,
      getClient: () => client,
    } as unknown as SupabaseService;

    const service = new SegmentService(supabaseService);
    await service.sweepStaleHeartbeats();

    expect(lt).toHaveBeenCalled();
    expect(windowSegmentsUpdate).toHaveBeenCalledWith({
      ended_at: STALE_PREVIOUS,
      close_reason: "stale",
    });
    expect(lte).toHaveBeenCalledWith("started_at", STALE_PREVIOUS);
  });

  it("updates classification on a closed segment row", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn(() => ({ update })),
      rpc: vi.fn(),
    };

    const supabaseService = {
      isConfigured: () => true,
      getClient: () => client,
    } as unknown as SupabaseService;

    const service = new SegmentService(supabaseService);
    const classification = {
      category: "Coding" as const,
      displayAppName: "Code",
      workRelated: "yes" as const,
    };

    await service.updateClassification("seg-1", classification);

    expect(update).toHaveBeenCalledWith({ classification });
    expect(eq).toHaveBeenCalledWith("id", "seg-1");
  });

  it("issues concurrent focus-change RPCs in start order", async () => {
    const rpcOrder: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const rpc = vi.fn(async (_name: string, args: { p_app_name: string }) => {
      rpcOrder.push(`start:${args.p_app_name}`);
      if (args.p_app_name === "first") {
        await firstStarted;
      }
      rpcOrder.push(`end:${args.p_app_name}`);
      return {
        data: { action: "opened", segment_id: `${args.p_app_name}-id` },
        error: null,
      };
    });

    const service = createFocusChangeService(rpc);
    const first = service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:01.000Z", "first"));
    const second = service.onFocusChange(
      "desk-pc",
      telemetry("2026-01-01T12:00:02.000Z", "second"),
    );

    await vi.waitFor(() => {
      expect(rpcOrder).toEqual(["start:first"]);
    });
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(rpcOrder).toEqual(["start:first", "end:first", "start:second", "end:second"]);
  });

  it("runs stale close after an in-flight focus-change RPC completes", async () => {
    let releaseFocus: (() => void) | undefined;
    const focusStarted = new Promise<void>((resolve) => {
      releaseFocus = resolve;
    });
    const mutationOrder: string[] = [];

    const rpc = vi.fn(async () => {
      mutationOrder.push("focus-start");
      await focusStarted;
      mutationOrder.push("focus-end");
      return { data: { action: "opened", segment_id: "seg-1" }, error: null };
    });

    const lte = vi.fn(async () => {
      mutationOrder.push("stale-close");
      return { error: null };
    });
    const is = vi.fn().mockReturnValue({ lte });
    const eq = vi.fn().mockReturnValue({ is });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({ eq });

    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { last_seen_at: "2026-01-01T12:05:55.000Z" },
          error: null,
        }),
      }),
    });
    const heartbeatsUpsert = vi.fn().mockResolvedValue({ error: null });

    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect, upsert: heartbeatsUpsert };
        }
        if (table === "window_segments") {
          return { update: windowSegmentsUpdate };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = {
      isConfigured: () => true,
      getClient: () => client,
    } as unknown as SupabaseService;

    const service = new SegmentService(supabaseService);
    await service.onHostTick("desk-pc", STALE_PREVIOUS);
    const focus = service.onFocusChange("desk-pc", telemetry("2026-01-01T12:06:00.000Z", "Code"));

    await vi.waitFor(() => {
      expect(mutationOrder).toEqual(["focus-start"]);
    });

    const stale = service.onHostTick("desk-pc", STALE_INCOMING);
    releaseFocus?.();
    await Promise.all([focus, stale]);
    expect(mutationOrder).toEqual(["focus-start", "focus-end", "stale-close"]);
  });

  it("runs shutdown close after an in-flight focus-change RPC completes", async () => {
    let releaseFocus: (() => void) | undefined;
    const focusStarted = new Promise<void>((resolve) => {
      releaseFocus = resolve;
    });
    const mutationOrder: string[] = [];

    const rpc = vi.fn(async () => {
      mutationOrder.push("focus-start");
      await focusStarted;
      mutationOrder.push("focus-end");
      return { data: { action: "opened", segment_id: "seg-1" }, error: null };
    });

    const lte = vi.fn(async () => {
      mutationOrder.push("shutdown-close");
      return { error: null };
    });
    const is = vi.fn().mockReturnValue({ lte });
    const eq = vi.fn().mockReturnValue({ is });
    const windowSegmentsUpdate = vi.fn().mockReturnValue({ eq });

    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { last_seen_at: "2026-01-01T12:05:55.000Z" },
          error: null,
        }),
      }),
    });
    const heartbeatsUpsert = vi.fn().mockResolvedValue({ error: null });

    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "window_segments") {
          return { update: windowSegmentsUpdate };
        }
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect, upsert: heartbeatsUpsert };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = {
      isConfigured: () => true,
      getClient: () => client,
    } as unknown as SupabaseService;

    const service = new SegmentService(supabaseService);
    await service.onHostTick("desk-pc", STALE_PREVIOUS);
    const focus = service.onFocusChange("desk-pc", telemetry("2026-01-01T12:06:00.000Z", "Code"));

    await vi.waitFor(() => {
      expect(mutationOrder).toEqual(["focus-start"]);
    });

    const shutdown = service.closeForShutdown("desk-pc", "2026-01-01T12:06:30.000Z");
    releaseFocus?.();
    await Promise.all([focus, shutdown]);
    expect(mutationOrder).toEqual(["focus-start", "focus-end", "shutdown-close"]);
    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-01-01T12:06:30.000Z",
      last_active_at: "2026-01-01T12:06:30.000Z",
    });
  });
});
