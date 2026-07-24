import { z } from "zod";

export { pickSpinnerVerb, SPINNER_VERBS, type SpinnerVerb } from "./spinner-verbs.js";

export const TELEMETRY_ROUTE = "/telemetry";
export const HOST_ROUTE = "/host";
export const SETTINGS_ROUTE = "/settings";

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

export const classificationStatusSchema = z.enum(["pending", "ready", "failed", "disabled"]);

export const telemetryPayloadSchema = z.object({
  appName: z.string().min(1),
  windowTitle: z.string().min(1),
  capturedAt: z.string().datetime(),
});

export const playbackStatusSchema = z.enum(["playing", "paused", "stopped", "unknown"]);

export const hostMediaSchema = z.object({
  title: z.string().min(1),
  artist: z.string().nullable(),
  albumTitle: z.string().nullable(),
  appName: z.string().nullable(),
  playbackStatus: playbackStatusSchema,
});

export const hostPayloadSchema = z.object({
  idleMs: z.number().nonnegative(),
  cpuPercent: z.number().min(0).max(100),
  ramPercent: z.number().min(0).max(100),
  uptimeSec: z.number().nonnegative(),
  media: hostMediaSchema.nullable(),
  capturedAt: z.string().datetime(),
});

export const telemetryStateSchema = telemetryPayloadSchema.extend({
  receivedAt: z.string().datetime(),
  classification: windowClassificationSchema.nullable(),
  classificationStatus: classificationStatusSchema,
  host: hostPayloadSchema.nullable(),
});

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

export type ParseTelemetryPayloadResult =
  | { success: true; data: TelemetryPayload }
  | { success: false; issues: z.ZodFormattedError<unknown> };

export type ParseHostPayloadResult =
  | { success: true; data: HostPayload }
  | { success: false; issues: z.ZodFormattedError<unknown> };

export const parseTelemetryPayload = (body: unknown): ParseTelemetryPayloadResult => {
  const result = telemetryPayloadSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, issues: result.error.format() };
};

export const parseHostPayload = (body: unknown): ParseHostPayloadResult => {
  const result = hostPayloadSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, issues: result.error.format() };
};
