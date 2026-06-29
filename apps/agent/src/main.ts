import { TELEMETRY_ROUTE, type TelemetryPayload } from "@pryladova/shared";
import activeWin from "active-win";
import { loadConfig } from "./config.js";
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

const buildPayload = (window: RawWindowSnapshot, blockedApps: Set<string>): TelemetryPayload => {
  const sanitized = sanitizeSnapshot(window, blockedApps);
  return {
    ...sanitized,
    capturedAt: new Date().toISOString(),
  };
};

const postTelemetry = async (apiUrl: string, payload: TelemetryPayload): Promise<void> => {
  const response = await fetch(`${apiUrl}${TELEMETRY_ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telemetry POST failed (${response.status}): ${body}`);
  }
};

const snapshotKey = (payload: TelemetryPayload): string =>
  `${payload.appName}|${payload.windowTitle}`;

const run = async (): Promise<void> => {
  const config = loadConfig();
  const blockedApps = createBlockedAppsSet(config.blockedApps);
  let lastKey = "";

  const tick = async (): Promise<void> => {
    const window = await readActiveWindow();
    if (!window) {
      return;
    }

    const payload = buildPayload(window, blockedApps);
    const key = snapshotKey(payload);
    if (key === lastKey) {
      return;
    }

    await postTelemetry(config.apiUrl, payload);
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
