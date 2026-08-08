import { z } from "zod";

export {
  pickRandomSpinnerVerb,
  pickSpinnerVerb,
  SPINNER_VERBS,
  type SpinnerVerb,
} from "./spinner-verbs.js";
export { weatherCodeToCondition } from "./weather-codes.js";

export const SETTINGS_ROUTE = "/api/settings";
export const HEALTH_ROUTE = "/api/health";
export const AUTH_LOGIN_ROUTE = "/api/auth/login";
export const AUTH_LOGOUT_ROUTE = "/api/auth/logout";
export const AUTH_SESSION_ROUTE = "/api/auth/session";
export const WEATHER_ROUTE = "/api/weather";
export const WEATHER_CITIES_ROUTE = "/api/weather/cities";
export const WEATHER_REVERSE_ROUTE = "/api/weather/reverse";
export const PANEL_WS_ROUTE = "/api/ws/panel";
export const AGENT_WS_ROUTE = "/api/ws/agent";

/** Max base64 album-art payload length accepted on ingest (~512 KB). */
export const THUMBNAIL_DATA_URL_MAX_LENGTH = 512_000;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  release: z.string().min(1).optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const loginRequestSchema = z.object({
  password: z.string().min(1),
});

export const authSessionResponseSchema = z.object({
  authenticated: z.boolean(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const SECURE_APP_NAME = "Secure";
export const SECURE_WINDOW_TITLE = "Redacted";

export const isRedactedTelemetry = (appName: string, windowTitle: string): boolean =>
  appName === SECURE_APP_NAME && windowTitle === SECURE_WINDOW_TITLE;

export const activityCategorySchema = z.enum([
  "Coding",
  "Gaming",
  "Browsing",
  "Media",
  "Communication",
  "Design",
  "Productivity",
  "System",
  "Other",
]);

export const workRelatedSchema = z.enum(["yes", "no", "maybe"]);

export const windowClassificationSchema = z.object({
  category: activityCategorySchema,
  displayAppName: z.string().min(1),
  workRelated: workRelatedSchema.describe(
    "yes = clearly work; no = clearly personal/leisure; maybe = ambiguous (e.g. browser with mixed tabs, unclear context)",
  ),
});

export const settingsSchema = z.object({
  classificationEnabled: z.boolean(),
});

export const classificationStatusSchema = z.enum([
  "pending",
  "ready",
  "failed",
  "misconfigured",
  "disabled",
]);

export const telemetryPayloadSchema = z.object({
  appName: z.string().min(1),
  windowTitle: z.string().min(1),
  capturedAt: z.iso.datetime(),
});

export const playbackStatusSchema = z.enum(["playing", "paused", "stopped", "unknown"]);

export const hostMediaSchema = z.object({
  title: z.string().min(1),
  artist: z.string().nullable(),
  albumTitle: z.string().nullable(),
  appName: z.string().nullable(),
  playbackStatus: playbackStatusSchema,
  thumbnailDataUrl: z
    .string()
    .startsWith("data:image/")
    .max(THUMBNAIL_DATA_URL_MAX_LENGTH)
    .nullable()
    .default(null),
});

export const weatherReadySchema = z.object({
  status: z.literal("ready"),
  temperatureC: z.number(),
  weatherCode: z.number().int(),
  condition: z.string().min(1),
  fetchedAt: z.iso.datetime(),
});

export const weatherResponseSchema = z.discriminatedUnion("status", [
  weatherReadySchema,
  z.object({ status: z.literal("disabled") }),
  z.object({ status: z.literal("unavailable") }),
]);

/** Identity key for a media track: same source data yields the same key regardless of case/whitespace. */
export const trackMediaKey = (media: HostMedia): string =>
  [
    media.title.trim().toLowerCase(),
    (media.artist ?? "").trim().toLowerCase(),
    (media.albumTitle ?? "").trim().toLowerCase(),
    (media.appName ?? "").trim().toLowerCase(),
  ].join("|");

export const hostPayloadSchema = z.object({
  idleMs: z.number().nonnegative(),
  cpuPercent: z.number().min(0).max(100),
  ramPercent: z.number().min(0).max(100),
  uptimeSec: z.number().nonnegative(),
  media: hostMediaSchema.nullable(),
  capturedAt: z.iso.datetime(),
});

export const telemetryStateSchema = telemetryPayloadSchema.extend({
  receivedAt: z.iso.datetime(),
  classification: windowClassificationSchema.nullable(),
  classificationStatus: classificationStatusSchema,
  host: hostPayloadSchema.nullable(),
});

export const panelWsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("state"),
    telemetry: telemetryStateSchema,
  }),
  z.object({
    type: z.literal("empty"),
  }),
]);

export const agentWsInboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update"),
    host: hostPayloadSchema,
    telemetry: telemetryPayloadSchema.optional(),
  }),
  z.object({
    type: z.literal("host"),
    payload: hostPayloadSchema,
  }),
  z.object({
    type: z.literal("telemetry"),
    payload: telemetryPayloadSchema,
  }),
]);

export type ActivityCategory = z.infer<typeof activityCategorySchema>;
export type WindowClassification = z.infer<typeof windowClassificationSchema>;
export type WorkRelated = z.infer<typeof workRelatedSchema>;
export type ClassificationStatus = z.infer<typeof classificationStatusSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
export type PlaybackStatus = z.infer<typeof playbackStatusSchema>;
export type HostMedia = z.infer<typeof hostMediaSchema>;
export type HostPayload = z.infer<typeof hostPayloadSchema>;
export type TelemetryState = z.infer<typeof telemetryStateSchema>;
export type PanelWsMessage = z.infer<typeof panelWsMessageSchema>;
export type AgentWsInbound = z.infer<typeof agentWsInboundSchema>;
export type WeatherReady = z.infer<typeof weatherReadySchema>;
export type WeatherResponse = z.infer<typeof weatherResponseSchema>;

export const geocodeCitySchema = z.object({
  label: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
});

export const geocodeCitiesResponseSchema = z.array(geocodeCitySchema);

export type GeocodeCity = z.infer<typeof geocodeCitySchema>;

export const parseSettings = (body: unknown): Settings => settingsSchema.parse(body);

export const parseTelemetryState = (state: unknown): TelemetryState =>
  telemetryStateSchema.parse(state);

export const parseHealthResponse = (response: unknown): HealthResponse =>
  healthResponseSchema.parse(response);

export const parseLoginRequest = (body: unknown): LoginRequest => loginRequestSchema.parse(body);

export const parseAuthSessionResponse = (response: unknown): AuthSessionResponse =>
  authSessionResponseSchema.parse(response);

export const parseWeatherResponse = (response: unknown): WeatherResponse =>
  weatherResponseSchema.parse(response);

export const parseGeocodeCitiesResponse = (response: unknown): GeocodeCity[] =>
  geocodeCitiesResponseSchema.parse(response);

export const parseGeocodeCity = (response: unknown): GeocodeCity =>
  geocodeCitySchema.parse(response);

export const parsePanelWsMessage = (body: unknown): PanelWsMessage =>
  panelWsMessageSchema.parse(body);

export const parseAgentWsInbound = (body: unknown): AgentWsInbound =>
  agentWsInboundSchema.parse(body);
