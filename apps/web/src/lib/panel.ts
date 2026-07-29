import {
  SETTINGS_ROUTE,
  settingsSchema,
  TELEMETRY_ROUTE,
  type TelemetryState,
  telemetryStateSchema,
} from "@pryladova/shared";

export const POLL_INTERVAL_MS = 2000;
export const AGENT_HINT_AFTER_MS = 10_000;
export const CLASSIFICATION_ENABLED_KEY = "pryladova.classificationEnabled";

export type PanelState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; telemetry: TelemetryState }
  | { status: "error"; message: string };

export const readStoredClassificationEnabled = (): boolean => {
  const stored = localStorage.getItem(CLASSIFICATION_ENABLED_KEY);
  if (stored === null) {
    return false;
  }
  return stored === "true";
};

export const syncSettings = async (classificationEnabled: boolean): Promise<void> => {
  const response = await fetch(SETTINGS_ROUTE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classificationEnabled }),
  });
  if (!response.ok) {
    throw new Error(`Settings error (${response.status})`);
  }
  const json: unknown = await response.json();
  settingsSchema.parse(json);
};

export const fetchTelemetry = async (): Promise<PanelState> => {
  const response = await fetch(TELEMETRY_ROUTE);

  if (response.status === 404) {
    return { status: "empty" };
  }

  if (!response.ok) {
    return { status: "error", message: `API error (${response.status})` };
  }

  const json: unknown = await response.json();
  const telemetry = telemetryStateSchema.parse(json);
  return { status: "ready", telemetry };
};

export const getAgentLastSeenMs = (panel: PanelState): number | null => {
  if (panel.status !== "ready") {
    return null;
  }

  const timestamps = [Date.parse(panel.telemetry.receivedAt)];
  if (panel.telemetry.host?.capturedAt) {
    timestamps.push(Date.parse(panel.telemetry.host.capturedAt));
  }

  return Math.max(...timestamps);
};
