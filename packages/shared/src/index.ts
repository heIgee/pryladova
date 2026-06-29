import { z } from "zod";

export const TELEMETRY_ROUTE = "/telemetry";

export const telemetryPayloadSchema = z.object({
  appName: z.string().min(1),
  windowTitle: z.string().min(1),
  capturedAt: z.string().datetime(),
});

export const telemetryStateSchema = telemetryPayloadSchema.extend({
  receivedAt: z.string().datetime(),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
export type TelemetryState = z.infer<typeof telemetryStateSchema>;

export type ParseTelemetryPayloadResult =
  | { success: true; data: TelemetryPayload }
  | { success: false; issues: z.ZodFormattedError<unknown> };

export const parseTelemetryPayload = (body: unknown): ParseTelemetryPayloadResult => {
  const result = telemetryPayloadSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, issues: result.error.format() };
};
