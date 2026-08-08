import {
  HOST_ROUTE,
  type HostPayload,
  TELEMETRY_ROUTE,
  type TelemetryPayload,
} from "@pryladova/shared";
import { loadConfig } from "./config.js";
import { initHostMetrics, readHostMetrics } from "./host-metrics.js";
import { readNowPlaying, trackMediaKey } from "./now-playing.js";
import {
  createBlockedAppsSet,
  type RawWindowSnapshot,
  sanitizeSnapshot,
  shouldOmitHostMedia,
} from "./privacy.js";

const POST_TIMEOUT_MS = 30_000;
const POST_ERROR_BODY_MAX = 200;

const truncatePostErrorBody = (text: string): string =>
  text.length <= POST_ERROR_BODY_MAX ? text : `${text.slice(0, POST_ERROR_BODY_MAX)}…`;

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

const postJson = async (
  url: string,
  body: unknown,
  ingestSecret: string | undefined,
): Promise<void> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ingestSecret) {
    headers.Authorization = `Bearer ${ingestSecret}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    const body = truncatePostErrorBody(text);
    throw new Error(`POST ${url} failed (${response.status}): ${body}`);
  }
};

const snapshotKey = (payload: TelemetryPayload): string =>
  `${payload.appName}|${payload.windowTitle}`;

const run = async (): Promise<void> => {
  const config = loadConfig();
  await initHostMetrics();
  console.log(`[agent] pid=${process.pid} profile=${config.profile} api=${config.apiUrl}`);
  const blockedApps = createBlockedAppsSet(config.blockedApps);
  let lastKey = "";
  let lastTrackKey = "";
  let cachedThumbnail: string | null = null;
  let tickInFlight = false;

  const tick = async (): Promise<void> => {
    const foreground = await readActiveWindow();
    const hostResult = await buildHostPayload(
      lastTrackKey,
      cachedThumbnail,
      foreground,
      blockedApps,
    );
    if (hostResult.host.cpuPercent !== undefined) {
      await postJson(
        `${config.apiUrl}${HOST_ROUTE}`,
        hostResult.host as HostPayload,
        config.ingestSecret,
      );
      // Track cache only after a successful host POST — otherwise the CPU warm-up skip
      // marks the current track as "seen" and the next POST omits the thumbnail.
      lastTrackKey = hostResult.lastTrackKey;
      cachedThumbnail = hostResult.cachedThumbnail;
    }

    if (!foreground) {
      return;
    }

    const payload = buildTelemetryPayload(foreground, blockedApps);
    const key = snapshotKey(payload);
    if (key === lastKey) {
      return;
    }

    await postJson(`${config.apiUrl}${TELEMETRY_ROUTE}`, payload, config.ingestSecret);
    lastKey = key;
    console.log(`[agent] ${payload.appName} — ${payload.windowTitle}`);
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
