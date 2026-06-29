import activeWin from "active-win";
import {
  TELEMETRY_ROUTE,
  type TelemetryPayload,
} from "@pryladova/shared";
import { loadConfig } from "./config.js";

type WindowSnapshot = {
  title: string;
  owner: {
    name: string;
  };
};

const readActiveWindow = async (): Promise<WindowSnapshot | undefined> => {
  const result = await activeWin();
  if (!result?.title || !result.owner?.name) {
    return undefined;
  }
  return {
    title: result.title,
    owner: { name: result.owner.name },
  };
};

const buildPayload = (window: WindowSnapshot): TelemetryPayload => ({
  appName: window.owner.name,
  windowTitle: window.title,
  capturedAt: new Date().toISOString(),
});

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
  let lastKey = "";

  const tick = async (): Promise<void> => {
    const window = await readActiveWindow();
    if (!window) {
      return;
    }

    const payload = buildPayload(window);
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
