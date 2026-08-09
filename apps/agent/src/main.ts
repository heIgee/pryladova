import type { HostPayload, TelemetryPayload } from "@pryladova/shared";
import { loadConfig } from "./config.js";
import { initHostMetrics, readHostMetrics } from "./host-metrics.js";
import { readNowPlaying, resolveHostMediaThumbnail } from "./now-playing.js";
import {
  createBlockedAppsSet,
  type RawWindowSnapshot,
  resolveAppName,
  sanitizeSnapshot,
  shouldOmitHostMedia,
} from "./privacy.js";
import { type AgentWsClient, type AgentWsConnectResult, connectAgentWs } from "./ws-client.js";

type HostPayloadPost = Omit<HostPayload, "cpuPercent"> & { cpuPercent?: number };

const readActiveWindow = async (): Promise<RawWindowSnapshot | undefined> => {
  const { default: activeWin } = await import("active-win");
  const result = await activeWin();
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

const watchHubBoundReject = (hubBoundReject: Promise<never>): void => {
  void hubBoundReject.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent] ${message}`);
    process.exit(1);
  });
};

const connectWithRetry = async (
  apiUrl: string,
  ingestSecret: string | undefined,
  agentId: string,
  onDisconnect: () => void,
): Promise<AgentWsConnectResult> => {
  for (;;) {
    try {
      return await connectAgentWs(apiUrl, ingestSecret, agentId, onDisconnect);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[agent] ws connect failed: ${message}`);
      await new Promise((resolve) => {
        setTimeout(resolve, 2_000);
      });
    }
  }
};

const run = async (): Promise<void> => {
  const config = loadConfig();
  await initHostMetrics();
  console.log(
    `[agent] pid=${process.pid} agentId=${config.agentId} profile=${config.profile} api=${config.apiUrl}`,
  );
  const blockedApps = createBlockedAppsSet(config.blockedApps);
  let lastKey = "";
  let lastTrackKey = "";
  let cachedThumbnail: string | null = null;
  let tickInFlight = false;
  let shuttingDown = false;
  let reconnecting = false;
  let connection!: AgentWsConnectResult;
  let reconnectAgent!: () => Promise<void>;

  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void (async (): Promise<void> => {
      try {
        await connection.client.sendShutdown(new Date().toISOString());
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent] shutdown send failed: ${message}`);
      }
      connection.client.close();
      process.exit(0);
    })();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const tick = async (client: AgentWsClient): Promise<void> => {
    const capturedAt = new Date().toISOString();
    const foreground = await readActiveWindow();
    const hostResult = await buildHostPayload(
      lastTrackKey,
      cachedThumbnail,
      foreground,
      blockedApps,
      capturedAt,
    );

    if (hostResult.host.cpuPercent !== undefined) {
      let telemetry: TelemetryPayload | undefined;
      if (foreground) {
        const payload = buildTelemetryPayload(foreground, blockedApps, capturedAt);
        const key = snapshotKey(payload);
        if (key !== lastKey) {
          telemetry = payload;
          lastKey = key;
          console.log(`[agent] ${payload.appName} — ${payload.windowTitle}`);
        }
      }

      client.sendUpdate(hostResult.host as HostPayload, telemetry);
      lastTrackKey = hostResult.lastTrackKey;
      cachedThumbnail = hostResult.cachedThumbnail;
    }

    if (!foreground) {
      return;
    }
  };

  const runTick = async (): Promise<void> => {
    if (tickInFlight || shuttingDown) {
      return;
    }

    tickInFlight = true;
    try {
      await tick(connection.client);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[agent] ws update send failed: ${message}`);
      await reconnectAgent();
    } finally {
      tickInFlight = false;
    }
  };

  const onUnexpectedClose = (): void => {
    if (shuttingDown || reconnecting) {
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
      connection.client.close();
      connection = await connectWithRetry(
        config.apiUrl,
        config.ingestSecret,
        config.agentId,
        onUnexpectedClose,
      );
      lastKey = "";
      watchHubBoundReject(connection.hubBoundReject);
      await runTick();
    } finally {
      reconnecting = false;
    }
  };

  connection = await connectWithRetry(
    config.apiUrl,
    config.ingestSecret,
    config.agentId,
    onUnexpectedClose,
  );
  watchHubBoundReject(connection.hubBoundReject);

  await runTick();
  setInterval(() => {
    void runTick().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[agent] ${message}`);
    });
  }, config.pollIntervalMs);
};

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent] fatal: ${message}`);
  process.exit(1);
});
