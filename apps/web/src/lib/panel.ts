import {
  mergeTelemetryHost,
  type PanelWsMessage,
  SETTINGS_ROUTE,
  type SettingsPutResponse,
  settingsPutResponseSchema,
  settingsSchema,
  type TelemetryState,
} from "@pryladova/shared";
import { apiFetch } from "./api-fetch.js";

export const WEATHER_POLL_INTERVAL_MS = 1_800_000;
export const INTEGRATIONS_POLL_INTERVAL_MS = 600_000;
export const AGENT_HINT_AFTER_MS = 10_000;

export const readAgentHintAfterMs = (): number => {
  const raw = import.meta.env.VITE_AGENT_HINT_AFTER_MS;
  if (typeof raw !== "string" || raw.length === 0) {
    return AGENT_HINT_AFTER_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : AGENT_HINT_AFTER_MS;
};
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

export const persistClassificationEnabled = (classificationEnabled: boolean): void => {
  localStorage.setItem(CLASSIFICATION_ENABLED_KEY, String(classificationEnabled));
};

export const fetchSettings = async (): Promise<{ classificationEnabled: boolean }> => {
  const response = await apiFetch(SETTINGS_ROUTE);
  if (!response.ok) {
    throw new Error(`Settings error (${response.status})`);
  }
  const json: unknown = await response.json();
  return settingsSchema.parse(json);
};

export const syncSettings = async (
  classificationEnabled: boolean,
): Promise<SettingsPutResponse> => {
  const response = await apiFetch(SETTINGS_ROUTE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classificationEnabled }),
  });
  if (!response.ok) {
    throw new Error(`Settings error (${response.status})`);
  }
  const json: unknown = await response.json();
  return settingsPutResponseSchema.parse(json);
};

export const applyPanelWsMessage = (panel: PanelState, message: PanelWsMessage): PanelState => {
  if (message.type === "empty") {
    if (panel.status === "ready") {
      return panel;
    }
    return { status: "empty" };
  }

  if (message.type === "state") {
    return { status: "ready", telemetry: message.telemetry };
  }

  if (panel.status !== "ready") {
    return panel;
  }

  return {
    status: "ready",
    telemetry: mergeTelemetryHost(panel.telemetry, message.host),
  };
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

export const isAgentStale = (panel: PanelState, nowMs = Date.now()): boolean => {
  const lastSeenMs = getAgentLastSeenMs(panel);
  if (lastSeenMs === null) {
    return false;
  }

  return nowMs - lastSeenMs >= readAgentHintAfterMs();
};

export const shouldShowMediaTile = (host: TelemetryState["host"] | undefined): boolean =>
  host != null && host.media != null;
