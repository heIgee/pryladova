import type { HostPayload, TelemetryPayload } from "@pryladova/shared";
import { loadConfig } from "./config.js";
import { initHostMetrics, readHostMetrics } from "./host-metrics.js";
import { readNowPlaying, trackMediaKey } from "./now-playing.js";
import {
  createBlockedAppsSet,
  type RawWindowSnapshot,
  sanitizeSnapshot,
  shouldOmitHostMedia,
} from "./privacy.js";
import { type AgentWsClient, connectAgentWs } from "./ws-client.js";

type HostPayloadPost = Omit<HostPayload, "cpuPercent"> & { cpuPercent?: number };

const readActiveWindow = async (): Promise<RawWindowSnapshot | undefined> => {
  const { default: activeWin } = await import("active-win");
  const result = await activeWin();
  if (!result?.title || !result.owner?.name) {
    return undefined;
  }
  return {
    title: result.title,
    owner: {
      name: result.owner.name,
      path: result.owner.path,
    },
  };
};

const buildTelemetryPayload = (
  window: RawWindowSnapshot,
  blockedApps: Set<string>,
): TelemetryPayload => {
  const sanitized = sanitizeSnapshot(window, blockedApps);
  return {
    ...sanitized,
    capturedAt: new Date().toISOString(),
  };
};

const buildHostPayload = async (
  lastTrackKey: string,
  cachedThumbnail: string | null,
  foreground: RawWindowSnapshot | undefined,
  blockedApps: Set<string>,
): Promise<{
  host: HostPayloadPost;
  lastTrackKey: string;
  cachedThumbnail: string | null;
}> => {
  const metrics = readHostMetrics();
  const capturedAt = new Date().toISOString();

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

  const newTrackKey = trackMediaKey(media);
  const trackChanged = newTrackKey !== lastTrackKey;
  const nextThumbnail = trackChanged ? media.thumbnailDataUrl : cachedThumbnail;

  return {
    host: {
      ...metrics,
      media: {
        ...media,
        thumbnailDataUrl: trackChanged ? nextThumbnail : null,
      },
      capturedAt,
    },
    lastTrackKey: newTrackKey,
    cachedThumbnail: nextThumbnail,
  };
};

const snapshotKey = (payload: TelemetryPayload): string =>
  `${payload.appName}|${payload.windowTitle}`;

const connectWithRetry = async (
  apiUrl: string,
  ingestSecret: string | undefined,
): Promise<AgentWsClient> => {
  for (;;) {
    try {
      return await connectAgentWs(apiUrl, ingestSecret);
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
  console.log(`[agent] pid=${process.pid} profile=${config.profile} api=${config.apiUrl}`);
  const blockedApps = createBlockedAppsSet(config.blockedApps);
  let lastKey = "";
  let lastTrackKey = "";
  let cachedThumbnail: string | null = null;
  let tickInFlight = false;
  let client = await connectWithRetry(config.apiUrl, config.ingestSecret);

  const tick = async (): Promise<void> => {
    const foreground = await readActiveWindow();
    const hostResult = await buildHostPayload(
      lastTrackKey,
      cachedThumbnail,
      foreground,
      blockedApps,
    );

    if (hostResult.host.cpuPercent !== undefined) {
      let telemetry: TelemetryPayload | undefined;
      if (foreground) {
        const payload = buildTelemetryPayload(foreground, blockedApps);
        const key = snapshotKey(payload);
        if (key !== lastKey) {
          telemetry = payload;
          lastKey = key;
          console.log(`[agent] ${payload.appName} — ${payload.windowTitle}`);
        }
      }

      try {
        client.sendUpdate(hostResult.host as HostPayload, telemetry);
        lastTrackKey = hostResult.lastTrackKey;
        cachedThumbnail = hostResult.cachedThumbnail;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent] ws update send failed: ${message}`);
        client.close();
        client = await connectWithRetry(config.apiUrl, config.ingestSecret);
      }
    }

    if (!foreground) {
      return;
    }
  };

  const runTick = async (): Promise<void> => {
    if (tickInFlight) {
      return;
    }

    tickInFlight = true;
    try {
      await tick();
    } finally {
      tickInFlight = false;
    }
  };

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
