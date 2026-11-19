import {
  type AgentWsInbound,
  type HostPayload,
  hostPayloadSchema,
  type TelemetryPayload,
} from "@pryladova/shared";
import { loadConfig } from "./config.js";
import { initHostMetrics, readHostMetrics } from "./host-metrics.js";
import { agentLog } from "./logger.js";
import { readNowPlaying, setNowPlayingThumbnailListener } from "./now-playing.js";
import { resolveHostMediaThumbnail } from "./now-playing-core.js";
import {
  createBlockedAppsSet,
  type RawWindowSnapshot,
  resolveAppName,
  sanitizeSnapshot,
  shouldOmitHostMedia,
} from "./privacy.js";
import { defaultRetryQueuePath, openRetryQueue, replayPending } from "./retry-queue.js";
import { initSessionLock } from "./session-lock.js";
import { type AgentWsConnectResult, connectAgentWs } from "./ws-client.js";

type HostPayloadPost = Omit<HostPayload, "cpuPercent"> & { cpuPercent?: number };

let activeWinErrorLogged = false;

/** A failed foreground read must not skip host metrics or force a WS reconnect. */
const readForegroundOrUndefined = async () => {
  try {
    const { default: activeWin } = await import("active-win");
    const result = await activeWin();
    activeWinErrorLogged = false;
    return result;
  } catch (error: unknown) {
    if (!activeWinErrorLogged) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.warn(`active window read failed: ${message}`);
      activeWinErrorLogged = true;
    }
    return undefined;
  }
};

const readActiveWindow = async (): Promise<RawWindowSnapshot | undefined> => {
  const result = await readForegroundOrUndefined();
  if (!result?.title?.trim() || !result.owner?.name) {
    return undefined;
  }

  const snapshot: RawWindowSnapshot = {
    title: result.title,
    owner: {
      name: result.owner.name,
      path: result.owner.path,
    },
  };

  if (!resolveAppName(snapshot)) {
    return undefined;
  }

  return snapshot;
};

const buildTelemetryPayload = (
  window: RawWindowSnapshot,
  blockedApps: Set<string>,
  capturedAt: string,
): TelemetryPayload => {
  const sanitized = sanitizeSnapshot(window, blockedApps);
  return {
    ...sanitized,
    capturedAt,
  };
};

const buildHostPayload = async (
  lastTrackKey: string,
  cachedThumbnail: string | null,
  foreground: RawWindowSnapshot | undefined,
  blockedApps: Set<string>,
  capturedAt: string,
): Promise<{
  host: HostPayloadPost;
  lastTrackKey: string;
  cachedThumbnail: string | null;
}> => {
  const metrics = readHostMetrics();

  if (shouldOmitHostMedia(foreground, blockedApps)) {
    return {
      host: { ...metrics, media: null, capturedAt },
      lastTrackKey: "",
      cachedThumbnail: null,
    };
  }

  const media = await readNowPlaying();

  if (!media) {
    return {
      host: { ...metrics, media: null, capturedAt },
      lastTrackKey: "",
      cachedThumbnail: null,
    };
  }

  const resolved = resolveHostMediaThumbnail(media, { lastTrackKey, cachedThumbnail });

  return {
    host: {
      ...metrics,
      media: {
        ...media,
        thumbnailDataUrl: resolved.thumbnailDataUrl,
      },
      capturedAt,
    },
    lastTrackKey: resolved.lastTrackKey,
    cachedThumbnail: resolved.cachedThumbnail,
  };
};

const snapshotKey = (payload: TelemetryPayload): string =>
  `${payload.appName}|${payload.windowTitle}`;

const CONNECT_RETRY_BASE_MS = 2_000;
const CONNECT_RETRY_MAX_MS = 30_000;

const formatConnectError = (error: unknown): string => {
  if (error instanceof Error) {
    if ("code" in error && typeof error.code === "string" && error.code.length > 0) {
      return error.code;
    }
    const message = error.message.trim();
    if (message) {
      return message;
    }
    return error.name || "unknown error";
  }
  return String(error);
};

const watchHubBoundReject = (hubBoundReject: Promise<never>): void => {
  void hubBoundReject.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    agentLog.error(message);
    process.exit(1);
  });
};

const connectWithRetry = async (
  apiUrl: string,
  ingestSecret: string | undefined,
  agentId: string,
  onDisconnect: () => void,
): Promise<AgentWsConnectResult> => {
  let delayMs = CONNECT_RETRY_BASE_MS;
  let loggedFailure = false;

  for (;;) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: reconnect waits out the previous attempt
      const connection = await connectAgentWs(apiUrl, ingestSecret, agentId, onDisconnect);
      if (loggedFailure) {
        agentLog.info("ws connected");
      }
      return connection;
    } catch (error: unknown) {
      if (!loggedFailure) {
        agentLog.error(`ws connect failed: ${formatConnectError(error)} (retrying)`);
        loggedFailure = true;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
      delayMs = Math.min(delayMs * 2, CONNECT_RETRY_MAX_MS);
    }
  }
};

const run = async (): Promise<void> => {
  const config = loadConfig();
  const queue = await openRetryQueue(defaultRetryQueuePath());
  await initHostMetrics();
  agentLog.info(
    `pid=${process.pid} agentId=${config.agentId} profile=${config.profile} api=${config.apiUrl}`,
  );
  const blockedApps = createBlockedAppsSet(config.blockedApps);
  let lastKey = "";
  let lastTrackKey = "";
  let cachedThumbnail: string | null = null;
  let tickInFlight = false;
  let shuttingDown = false;
  let sessionLocked = false;
  let reconnecting = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let connection!: AgentWsConnectResult;
  let reconnectAgent!: () => Promise<void>;
  let releaseSessionLock = (): void => {};

  const sendPoll = (poll: AgentWsInbound): Promise<void> => {
    const client = connection?.client;
    if (!client?.isOpen()) {
      return Promise.reject(new Error("Agent WebSocket is not open"));
    }
    if (poll.type === "update") {
      return client.sendUpdate(poll.host, poll.sequence, poll.telemetry);
    }
    if (poll.type === "session_lock") {
      return client.sendSessionLock(poll.capturedAt, poll.sequence);
    }
    return client.sendShutdown(poll.capturedAt, poll.sequence);
  };

  const noteReplay = (poll: AgentWsInbound): void => {
    if (poll.type === "shutdown") {
      lastKey = "";
      return;
    }
    if (poll.type === "update" && poll.telemetry) {
      lastKey = snapshotKey(poll.telemetry);
    }
  };

  const replayUnsent = async (): Promise<void> => {
    if (!connection?.client?.isOpen()) {
      return;
    }
    await replayPending(queue, sendPoll, noteReplay);
  };

  const sendOrQueue = async (poll: AgentWsInbound): Promise<void> => {
    if (!connection?.client?.isOpen()) {
      queue.enqueue(poll);
      if (!reconnecting) {
        throw new Error("Agent WebSocket is not open");
      }
      return;
    }
    try {
      await sendPoll(poll);
    } catch (error: unknown) {
      queue.enqueue(poll);
      throw error;
    }
  };

  // One sender so a session lock cannot overtake an earlier poll.
  let outbound: Promise<void> = Promise.resolve();
  const runOutbound = (task: () => Promise<void>): Promise<void> => {
    const run = outbound.then(task);
    outbound = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    releaseSessionLock();
    void runOutbound(async () => {
      await replayUnsent();
      const poll: AgentWsInbound = {
        type: "shutdown",
        agentId: config.agentId,
        capturedAt: new Date().toISOString(),
        sequence: queue.nextSequence(),
      };
      await sendOrQueue(poll);
    })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        agentLog.error(`shutdown send failed: ${message}`);
      })
      .finally(() => {
        connection?.client?.close();
        queue.close();
        process.exit(0);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const tick = async (): Promise<void> => {
    await runOutbound(async () => {
      await replayUnsent();
      if (sessionLocked) {
        lastKey = "";
        return;
      }

      const capturedAt = new Date().toISOString();
      const foreground = await readActiveWindow();
      const hostResult = await buildHostPayload(
        lastTrackKey,
        cachedThumbnail,
        foreground,
        blockedApps,
        capturedAt,
      );

      if (hostResult.host.cpuPercent === undefined) {
        return;
      }

      let telemetry: TelemetryPayload | undefined;
      if (foreground) {
        const payload = buildTelemetryPayload(foreground, blockedApps, capturedAt);
        const key = snapshotKey(payload);
        if (key !== lastKey) {
          telemetry = payload;
          lastKey = key;
          agentLog.info(`${payload.appName} — ${payload.windowTitle}`);
        }
      }

      const poll: AgentWsInbound = {
        type: "update",
        agentId: config.agentId,
        sequence: queue.nextSequence(),
        host: hostPayloadSchema.parse(hostResult.host),
        ...(telemetry ? { telemetry } : {}),
      };
      await sendOrQueue(poll);
      lastTrackKey = hostResult.lastTrackKey;
      cachedThumbnail = hostResult.cachedThumbnail;
    });
  };

  const runTick = async (): Promise<void> => {
    if (tickInFlight || shuttingDown) {
      return;
    }

    tickInFlight = true;
    try {
      await tick();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error(`ws update send failed: ${message}`);
      tickInFlight = false;
      await reconnectAgent();
    } finally {
      tickInFlight = false;
    }
  };

  setNowPlayingThumbnailListener(() => {
    void runTick();
  });

  const onUnexpectedClose = (): void => {
    if (shuttingDown || reconnecting || !connection?.client) {
      return;
    }

    void reconnectAgent();
  };

  reconnectAgent = async (): Promise<void> => {
    if (shuttingDown || reconnecting) {
      return;
    }

    reconnecting = true;
    try {
      connection?.client?.close();
      connection = await connectWithRetry(
        config.apiUrl,
        config.ingestSecret,
        config.agentId,
        onUnexpectedClose,
      );
      watchHubBoundReject(connection.hubBoundReject);
    } finally {
      reconnecting = false;
    }
    if (!shuttingDown) {
      await runTick();
    }
  };

  connection = await connectWithRetry(
    config.apiUrl,
    config.ingestSecret,
    config.agentId,
    onUnexpectedClose,
  );
  watchHubBoundReject(connection.hubBoundReject);

  releaseSessionLock = await initSessionLock({
    onLock: () => {
      if (shuttingDown) {
        return;
      }
      sessionLocked = true;
      lastKey = "";
      void runOutbound(async () => {
        await replayUnsent();
        lastKey = "";
        const poll: AgentWsInbound = {
          type: "session_lock",
          agentId: config.agentId,
          capturedAt: new Date().toISOString(),
          sequence: queue.nextSequence(),
        };
        await sendOrQueue(poll);
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        agentLog.error(`session lock send failed: ${message}`);
        if (!reconnecting) {
          void reconnectAgent();
        }
      });
    },
    onUnlock: () => {
      sessionLocked = false;
    },
  });

  await runTick();
  pollTimer = setInterval(() => {
    void runTick().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      agentLog.error(message);
    });
  }, config.pollIntervalMs);
};

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  agentLog.error(`fatal: ${message}`);
  process.exit(1);
});
