import {
  HOST_ROUTE,
  type HostPayload,
  TELEMETRY_ROUTE,
  type TelemetryPayload,
} from "@pryladova/shared";
import activeWin from "active-win";
import { loadConfig } from "./config.js";
import { readHostMetrics } from "./host-metrics.js";
import { readNowPlaying } from "./now-playing.js";
import { createBlockedAppsSet, type RawWindowSnapshot, sanitizeSnapshot } from "./privacy.js";

const readActiveWindow = async (): Promise<RawWindowSnapshot | undefined> => {
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

const buildHostPayload = async (): Promise<HostPayload> => {
  const metrics = readHostMetrics();
  const media = await readNowPlaying();
  return {
    ...metrics,
    media,
    capturedAt: new Date().toISOString(),
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
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed (${response.status}): ${text}`);
  }
};

const snapshotKey = (payload: TelemetryPayload): string =>
  `${payload.appName}|${payload.windowTitle}`;

const run = async (): Promise<void> => {
  const config = loadConfig();
  console.log(`[agent] pid=${process.pid} profile=${config.profile} api=${config.apiUrl}`);
  const blockedApps = createBlockedAppsSet(config.blockedApps);
  let lastKey = "";

  const tick = async (): Promise<void> => {
    const host = await buildHostPayload();
    await postJson(`${config.apiUrl}${HOST_ROUTE}`, host, config.ingestSecret);

    const window = await readActiveWindow();
    if (!window) {
      return;
    }

    const payload = buildTelemetryPayload(window, blockedApps);
    const key = snapshotKey(payload);
    if (key === lastKey) {
      return;
    }

    await postJson(`${config.apiUrl}${TELEMETRY_ROUTE}`, payload, config.ingestSecret);
    lastKey = key;
    console.log(`[agent] ${payload.appName} — ${payload.windowTitle}`);
  };

  await tick();
  setInterval(() => {
    void tick().catch((error: unknown) => {
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
