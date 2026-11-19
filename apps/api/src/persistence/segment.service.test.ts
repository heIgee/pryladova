import type { TelemetryPayload } from "@pryladova/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseServiceFromClient } from "../test/persistence-mocks.js";
import { HEARTBEAT_PERSIST_MS } from "./segment.logic.js";
import { SegmentService } from "./segment.service.js";

const STALE_PREVIOUS = "2026-01-01T12:00:00.000Z";
const STALE_INCOMING = "2026-01-01T12:06:00.000Z";

const telemetry = (capturedAt: string, appName: string): TelemetryPayload => ({
  capturedAt,
  appName,
  windowTitle: "title",
});

const openSegmentSelect = (startedAt: string | null = null) =>
  vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: startedAt ? { started_at: startedAt } : null,
          error: null,
        }),
      }),
    }),
  });

const heartbeatRow = (dbLastSeenAt: string | null | undefined) => {
  if (dbLastSeenAt === undefined) {
    return { last_seen_at: STALE_PREVIOUS, last_active_at: STALE_PREVIOUS };
  }
  if (dbLastSeenAt === null) {
    return null;
  }
  return { last_seen_at: dbLastSeenAt, last_active_at: dbLastSeenAt };
};

const createSegmentRpcMock = (options?: {
  onClose?: () => void;
  closeReturns?: boolean;
  closeAndOpenResult?: { action: string; segment_id: string };
}) =>
  vi.fn(async (name: string) => {
    if (name === "close_open_segment") {
      options?.onClose?.();
      return { data: options?.closeReturns ?? true, error: null };
    }
    if (name === "open_window_segment") {
      return { data: true, error: null };
    }
    if (name === "sweep_stale_segments") {
      return { error: null };
    }
    if (name === "close_and_open_segment") {
      return {
        data: options?.closeAndOpenResult ?? { action: "opened", segment_id: "seg-1" },
        error: null,
      };
    }
    throw new Error(`unexpected rpc: ${name}`);
  });

const createHeartbeatClient = (options?: {
  dbLastSeenAt?: string | null;
  rpc?: ReturnType<typeof vi.fn>;
  windowSegmentsUpdate?: ReturnType<typeof vi.fn>;
  openSegmentStartedAt?: string | null;
}) => {
  const heartbeatsSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: heartbeatRow(options?.dbLastSeenAt),
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

  const rpc = options?.rpc ?? createSegmentRpcMock();

  const client = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "agent_heartbeats") {
        return {
          select: heartbeatsSelect,
          upsert: heartbeatsUpsert,
        };
      }
      if (table === "window_segments") {
        return {
          update: windowSegmentsUpdate,
          select: openSegmentSelect(options?.openSegmentStartedAt),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  const supabaseService = supabaseServiceFromClient(client);

  return {
    service: new SegmentService(supabaseService),
    heartbeatsSelect,
    heartbeatsUpsert,
    windowSegmentsUpdate,
    rpc,
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
      if (table === "window_segments") {
        return { select: openSegmentSelect() };
      }
      throw new Error(`unexpected from() call: ${table}`);
    }),
  };

  const supabaseService = supabaseServiceFromClient(client);

  return new SegmentService(supabaseService);
};

describe("SegmentService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips stale close on host tick when focus change owns segment boundaries", async () => {
    const { service, heartbeatsUpsert, rpc } = createHeartbeatClient();

    await service.onHostTick("desk-pc", STALE_INCOMING, { skipStaleClose: true });

    expect(rpc).not.toHaveBeenCalledWith("close_open_segment", expect.anything());
    expect(heartbeatsUpsert).not.toHaveBeenCalled();
  });

  it("closes a stale open segment before focus-change RPC after a long agent gap", async () => {
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { last_seen_at: STALE_PREVIOUS, last_active_at: STALE_PREVIOUS },
          error: null,
        }),
      }),
    });
    const rpc = createSegmentRpcMock();

    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect() };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = supabaseServiceFromClient(client);

    const service = new SegmentService(supabaseService);
    await service.onFocusChange("desk-pc", telemetry(STALE_INCOMING, "Cursor"));

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: STALE_PREVIOUS,
      p_close_reason: "stale",
    });
    expect(rpc).toHaveBeenCalledWith("close_and_open_segment", expect.anything());
  });

  it("closes open segments at last active time when the agent disconnects", async () => {
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
    const rpc = createSegmentRpcMock();

    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect() };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = supabaseServiceFromClient(client);

    const service = new SegmentService(supabaseService);
    await service.closeForAgentDisconnect("desk-pc");

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: "2026-08-08T22:05:00.000Z",
      p_close_reason: "stale",
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
    const { service, heartbeatsUpsert, rpc } = createHeartbeatClient();

    await service.onHostTick("desk-pc", STALE_INCOMING);

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: STALE_PREVIOUS,
      p_close_reason: "stale",
    });
    expect(heartbeatsUpsert).not.toHaveBeenCalled();
  });

  it("closes a post-idle agent gap at last input, not last seen", async () => {
    const { service, rpc } = createHeartbeatClient({
      dbLastSeenAt: "2026-08-08T22:00:00.000Z",
    });

    await service.onHostTick("desk-pc", "2026-08-08T22:00:00.000Z", { idleMs: 0 });
    await service.onHostTick("desk-pc", "2026-08-08T22:04:00.000Z", { idleMs: 6 * 60 * 1000 });
    rpc.mockClear();
    await service.onHostTick("desk-pc", "2026-08-08T22:10:00.000Z", { idleMs: 12 * 60 * 1000 });

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: "2026-08-08T21:58:00.000Z",
      p_close_reason: "stale",
    });
  });

  it("does not close a segment that started after the stale boundary", async () => {
    const { service, rpc } = createHeartbeatClient({
      openSegmentStartedAt: STALE_INCOMING,
    });

    await service.onHostTick("desk-pc", STALE_PREVIOUS);
    await service.onHostTick("desk-pc", STALE_INCOMING);

    expect(rpc).not.toHaveBeenCalledWith("close_open_segment", expect.anything());
  });

  it("does not open a new segment when the stale pre-close fails", async () => {
    const rpc = createSegmentRpcMock({ closeReturns: false });
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { last_seen_at: STALE_PREVIOUS, last_active_at: STALE_PREVIOUS },
          error: null,
        }),
      }),
    });
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect(STALE_PREVIOUS) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await expect(
      service.onFocusChange("desk-pc", telemetry(STALE_INCOMING, "Code")),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("close_open_segment", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("close_and_open_segment", expect.anything());
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

    const { service, heartbeatsUpsert, rpc } = createHeartbeatClient();

    await service.onHostTick("desk-pc", "2026-01-01T12:00:02.000Z");
    expect(heartbeatsUpsert).not.toHaveBeenCalled();

    await service.closeForShutdown("desk-pc", "2026-01-01T12:00:04.000Z");

    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-01-01T12:00:04.000Z",
      last_active_at: "2026-01-01T12:00:04.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: "2026-01-01T12:00:04.000Z",
      p_close_reason: "shutdown",
    });
  });

  it("closes the open segment with lock reason on session lock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const { service, rpc } = createHeartbeatClient();

    await service.closeForSessionLock("desk-pc", "2026-01-01T12:00:04.000Z");

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: "2026-01-01T12:00:04.000Z",
      p_close_reason: "lock",
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
    const rpc = createSegmentRpcMock();
    const client = { rpc, from: vi.fn() };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await service.sweepStaleHeartbeats();

    expect(rpc).toHaveBeenCalledWith("sweep_stale_segments", {
      p_cutoff: expect.any(String),
    });
  });

  it("updates classification on a closed segment row", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn(() => ({ update })),
      rpc: vi.fn(),
    };

    const supabaseService = supabaseServiceFromClient(client);

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

    const rpc = vi.fn(async (name: string) => {
      if (name === "close_and_open_segment") {
        mutationOrder.push("focus-start");
        await focusStarted;
        mutationOrder.push("focus-end");
        return { data: { action: "opened", segment_id: "seg-1" }, error: null };
      }
      if (name === "close_open_segment") {
        mutationOrder.push("stale-close");
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc: ${name}`);
    });

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
          return { select: openSegmentSelect() };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = supabaseServiceFromClient(client);

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

    const rpc = vi.fn(async (name: string) => {
      if (name === "close_and_open_segment") {
        mutationOrder.push("focus-start");
        await focusStarted;
        mutationOrder.push("focus-end");
        return { data: { action: "opened", segment_id: "seg-1" }, error: null };
      }
      if (name === "close_open_segment") {
        mutationOrder.push("shutdown-close");
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc: ${name}`);
    });

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
          return { select: openSegmentSelect() };
        }
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect, upsert: heartbeatsUpsert };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const supabaseService = supabaseServiceFromClient(client);

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

  it("ends a pre-downtime segment at its start instead of the next focus change", async () => {
    const segmentStart = "2026-08-27T15:41:57.906Z";
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            last_seen_at: "2026-08-27T15:00:00.000Z",
            last_active_at: "2026-08-27T15:00:00.000Z",
          },
          error: null,
        }),
      }),
    });
    const rpc = createSegmentRpcMock();
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect(segmentStart) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await service.onFocusChange("desk-pc", telemetry("2026-10-18T09:59:47.746Z", "Cursor"));

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: segmentStart,
      p_close_reason: "stale",
    });
    expect(rpc).toHaveBeenCalledWith("close_and_open_segment", {
      p_agent_id: "desk-pc",
      p_captured_at: "2026-10-18T09:59:47.746Z",
      p_app_name: "Cursor",
      p_window_title: "title",
    });
  });

  it("keeps a long open segment when the heartbeat is still fresh", async () => {
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            last_seen_at: "2026-10-18T09:59:00.000Z",
            last_active_at: "2026-10-18T09:59:00.000Z",
          },
          error: null,
        }),
      }),
    });
    const rpc = createSegmentRpcMock();
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect("2026-10-17T09:00:00.000Z") };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await service.onFocusChange("desk-pc", telemetry("2026-10-18T09:59:47.746Z", "Cursor"));

    expect(rpc).not.toHaveBeenCalledWith("close_open_segment", expect.anything());
    expect(rpc).toHaveBeenCalledWith("close_and_open_segment", expect.anything());
  });

  it("ends an overnight open segment at last active time, not at its start", async () => {
    const segmentStart = "2026-10-17T18:00:00.000Z";
    const lastActiveAt = "2026-10-17T20:00:00.000Z";
    const heartbeatsSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { last_seen_at: lastActiveAt, last_active_at: lastActiveAt },
          error: null,
        }),
      }),
    });
    const rpc = createSegmentRpcMock();
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return { select: heartbeatsSelect };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect(segmentStart) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await service.onFocusChange("desk-pc", telemetry("2026-10-18T16:00:00.000Z", "Cursor"));

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: lastActiveAt,
      p_close_reason: "stale",
    });
  });

  it("closes at the previous last_active when input resumes after idle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    const order: string[] = [];
    const rpc = createSegmentRpcMock({
      onClose: () => {
        order.push("close");
      },
    });
    const { service, heartbeatsUpsert } = createHeartbeatClient({
      dbLastSeenAt: "2026-01-01T12:00:00.000Z",
      rpc,
    });
    heartbeatsUpsert.mockImplementation(async () => {
      order.push("upsert");
      return { error: null };
    });

    await service.onHostTick("desk-pc", "2026-01-01T12:00:00.000Z", { idleMs: 0 });
    await service.onHostTick("desk-pc", "2026-01-01T12:00:02.000Z", { idleMs: 0 });
    await service.onHostTick("desk-pc", "2026-01-01T12:00:04.000Z", {
      idleMs: 6 * 60 * 60 * 1000,
    });
    expect(rpc).not.toHaveBeenCalledWith("close_open_segment", expect.anything());

    vi.advanceTimersByTime(HEARTBEAT_PERSIST_MS);
    await service.onHostTick("desk-pc", "2026-01-01T12:00:06.000Z", { idleMs: 0 });

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: "2026-01-01T06:00:04.000Z",
      p_close_reason: "stale",
    });
    expect(order[0]).toBe("close");
    expect(heartbeatsUpsert).toHaveBeenCalledWith({
      agent_id: "desk-pc",
      last_seen_at: "2026-01-01T12:00:06.000Z",
      last_active_at: "2026-01-01T12:00:06.000Z",
    });
  });

  it("reopens the current app in the same lock after an idle gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    const rpc = createSegmentRpcMock();
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    last_seen_at: "2026-01-01T12:00:00.000Z",
                    last_active_at: "2026-01-01T12:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect() };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await service.onHostTick("desk-pc", "2026-01-01T12:00:00.000Z", { idleMs: 0 });
    await service.onHostTick("desk-pc", "2026-01-01T12:00:04.000Z", {
      idleMs: 6 * 60 * 60 * 1000,
    });
    vi.advanceTimersByTime(HEARTBEAT_PERSIST_MS);
    await service.onHostTick("desk-pc", "2026-01-01T12:00:06.000Z", {
      idleMs: 0,
      appName: "Cursor",
      windowTitle: "app.tsx",
    });

    expect(rpc).toHaveBeenCalledWith("close_open_segment", {
      p_agent_id: "desk-pc",
      p_ended_at: "2026-01-01T06:00:04.000Z",
      p_close_reason: "stale",
    });
    expect(rpc).toHaveBeenCalledWith("open_window_segment", {
      p_agent_id: "desk-pc",
      p_started_at: "2026-01-01T12:00:06.000Z",
      p_app_name: "Cursor",
      p_window_title: "app.tsx",
    });
  });

  it("skips reopen when the stale close leaves a segment open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    const rpc = createSegmentRpcMock({ closeReturns: false });
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    last_seen_at: "2026-01-01T12:00:00.000Z",
                    last_active_at: "2026-01-01T12:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect("2026-01-01T12:00:00.000Z") };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));

    await service.onHostTick("desk-pc", "2026-01-01T12:00:00.000Z", { idleMs: 0 });
    await service.onHostTick("desk-pc", "2026-01-01T12:00:04.000Z", {
      idleMs: 6 * 60 * 60 * 1000,
    });
    vi.advanceTimersByTime(HEARTBEAT_PERSIST_MS);
    await service.onHostTick("desk-pc", "2026-01-01T12:00:06.000Z", {
      idleMs: 0,
      appName: "Cursor",
      windowTitle: "app.tsx",
    });

    expect(rpc).toHaveBeenCalledWith("close_open_segment", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("open_window_segment", expect.anything());
  });
});

const createSequencedService = (maxSequence: number | null) => {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    rpcCalls.push({ name, args });
    if (name === "close_and_open_segment") {
      return {
        data: { action: "opened", segment_id: `seg-${String(args.p_sequence)}` },
        error: null,
      };
    }
    if (name === "close_open_segment" || name === "open_window_segment") {
      return { data: true, error: null };
    }
    if (name === "claim_agent_sequence") {
      return { data: true, error: null };
    }
    throw new Error(`unexpected rpc: ${name}`);
  });

  const client = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "agent_heartbeats") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "window_segments") {
        return { select: openSegmentSelect() };
      }
      if (table === "agent_event_sequences") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: maxSequence === null ? null : { sequence: maxSequence },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return {
    service: new SegmentService(supabaseServiceFromClient(client)),
    rpcCalls,
  };
};

describe("SegmentService sequences", () => {
  it("opens two segments in sequence order and keeps capturedAt as the boundary", async () => {
    const { service, rpcCalls } = createSequencedService(null);
    const firstAt = "2026-01-01T12:00:00.000Z";
    const secondAt = "2026-01-01T12:00:02.000Z";

    await service.onFocusChange("desk-pc", telemetry(firstAt, "Chrome"), 1);
    await service.onFocusChange("desk-pc", telemetry(secondAt, "Code"), 2);

    const opens = rpcCalls.filter((call) => call.name === "close_and_open_segment");
    expect(opens.map((call) => call.args)).toEqual([
      {
        p_agent_id: "desk-pc",
        p_captured_at: firstAt,
        p_app_name: "Chrome",
        p_window_title: "title",
        p_sequence: 1,
      },
      {
        p_agent_id: "desk-pc",
        p_captured_at: secondAt,
        p_app_name: "Code",
        p_window_title: "title",
        p_sequence: 2,
      },
    ]);
  });

  it("does not open a second segment for a duplicate sequence", async () => {
    const { service, rpcCalls } = createSequencedService(null);

    await service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:00.000Z", "Chrome"), 5);
    await service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:02.000Z", "Code"), 5);

    const opens = rpcCalls.filter((call) => call.name === "close_and_open_segment");
    expect(opens).toHaveLength(1);
    expect(opens[0]?.args.p_app_name).toBe("Chrome");
    expect(opens[0]?.args.p_sequence).toBe(5);
  });

  it("does not apply a late sequence over a newer open segment", async () => {
    const { service, rpcCalls } = createSequencedService(null);

    await service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:02.000Z", "Code"), 2);
    await service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:00.000Z", "Chrome"), 1);

    const opens = rpcCalls.filter((call) => call.name === "close_and_open_segment");
    expect(opens).toHaveLength(1);
    expect(opens[0]?.args.p_app_name).toBe("Code");
    expect(opens[0]?.args.p_sequence).toBe(2);
  });

  it("ignores a sequence the database already applied", async () => {
    const { service, rpcCalls } = createSequencedService(7);

    await service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:00.000Z", "Chrome"), 7);
    await service.onFocusChange("desk-pc", telemetry("2026-01-01T12:00:02.000Z", "Code"), 8);

    const opens = rpcCalls.filter((call) => call.name === "close_and_open_segment");
    expect(opens.map((call) => call.args.p_sequence)).toEqual([8]);
  });

  it("closes a session lock when the applied-sequence read fails", async () => {
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ name, args });
      return { data: true, error: null };
    });
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "agent_heartbeats") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "window_segments") {
          return { select: openSegmentSelect() };
        }
        if (table === "agent_event_sequences") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: "connection reset" },
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    const service = new SegmentService(supabaseServiceFromClient(client));
    const capturedAt = "2026-01-01T12:00:04.000Z";

    await service.closeForSessionLock("desk-pc", capturedAt, 4);

    const closes = rpcCalls.filter((call) => call.name === "close_open_segment");
    expect(closes).toHaveLength(1);
    expect(closes[0]?.args).toMatchObject({
      p_agent_id: "desk-pc",
      p_close_reason: "lock",
      p_sequence: 4,
    });
  });

  it("closes a session lock once with close_reason lock", async () => {
    const { service, rpcCalls } = createSequencedService(null);
    const capturedAt = "2026-01-01T12:00:04.000Z";

    await service.closeForSessionLock("desk-pc", capturedAt, 4);
    await service.closeForSessionLock("desk-pc", capturedAt, 4);

    const closes = rpcCalls.filter((call) => call.name === "close_open_segment");
    expect(closes).toHaveLength(1);
    expect(closes[0]?.args).toMatchObject({
      p_agent_id: "desk-pc",
      p_ended_at: capturedAt,
      p_close_reason: "lock",
      p_sequence: 4,
    });
  });

  it("does not repeat a host tick for a sequence already applied", async () => {
    const { service, rpcCalls } = createSequencedService(null);

    await service.onHostTick("desk-pc", "2026-01-01T12:00:00.000Z", { sequence: 3, idleMs: 0 });
    await service.onHostTick("desk-pc", "2026-01-01T12:00:02.000Z", { sequence: 3, idleMs: 0 });

    expect(rpcCalls.filter((call) => call.name === "claim_agent_sequence")).toHaveLength(1);
    expect(rpcCalls.filter((call) => call.name === "close_open_segment")).toHaveLength(0);
  });
});
