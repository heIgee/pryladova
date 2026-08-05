import { describe, expect, it } from "vitest";
import {
  hostMediaSchema,
  isRedactedTelemetry,
  parseHostPayload,
  parseTelemetryPayload,
  SECURE_APP_NAME,
  SECURE_WINDOW_TITLE,
  settingsSchema,
  weatherCodeToCondition,
  weatherResponseSchema,
} from "./index.js";

const validTelemetry = {
  appName: "Code",
  windowTitle: "app.tsx",
  capturedAt: "2026-01-01T12:00:00.000Z",
};

const validHost = {
  idleMs: 1000,
  cpuPercent: 12.5,
  ramPercent: 45,
  uptimeSec: 3600,
  media: null,
  capturedAt: "2026-01-01T12:00:00.000Z",
};

describe("parseTelemetryPayload", () => {
  it("accepts a valid payload", () => {
    const result = parseTelemetryPayload(validTelemetry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validTelemetry);
    }
  });

  it("rejects missing fields", () => {
    const result = parseTelemetryPayload({ appName: "Code" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime", () => {
    const result = parseTelemetryPayload({
      ...validTelemetry,
      capturedAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseHostPayload", () => {
  it("accepts a valid payload", () => {
    const result = parseHostPayload(validHost);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validHost);
    }
  });

  it("rejects cpuPercent above 100", () => {
    const result = parseHostPayload({ ...validHost, cpuPercent: 101 });
    expect(result.success).toBe(false);
  });
});

describe("isRedactedTelemetry", () => {
  it("detects secure redacted payloads", () => {
    expect(isRedactedTelemetry(SECURE_APP_NAME, SECURE_WINDOW_TITLE)).toBe(true);
  });

  it("returns false for normal payloads", () => {
    expect(isRedactedTelemetry("Code", "app.tsx")).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("parses classification toggle", () => {
    expect(settingsSchema.parse({ classificationEnabled: true })).toEqual({
      classificationEnabled: true,
    });
  });
});

describe("hostMediaSchema", () => {
  it("accepts thumbnail data url", () => {
    const media = hostMediaSchema.parse({
      title: "Track",
      artist: "Artist",
      albumTitle: null,
      appName: "foobar",
      playbackStatus: "playing",
      thumbnailDataUrl: "data:image/jpeg;base64,abc",
    });
    expect(media.thumbnailDataUrl).toBe("data:image/jpeg;base64,abc");
  });

  it("accepts null thumbnail", () => {
    const media = hostMediaSchema.parse({
      title: "Track",
      artist: null,
      albumTitle: null,
      appName: null,
      playbackStatus: "paused",
      thumbnailDataUrl: null,
    });
    expect(media.thumbnailDataUrl).toBeNull();
  });

  it("defaults missing thumbnail to null", () => {
    const media = hostMediaSchema.parse({
      title: "Track",
      artist: null,
      albumTitle: null,
      appName: null,
      playbackStatus: "playing",
    });
    expect(media.thumbnailDataUrl).toBeNull();
  });
});

describe("weatherResponseSchema", () => {
  it("parses ready response", () => {
    const response = weatherResponseSchema.parse({
      status: "ready",
      temperatureC: 22.4,
      weatherCode: 0,
      condition: "Clear",
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(response.status).toBe("ready");
  });

  it("parses disabled and unavailable", () => {
    expect(weatherResponseSchema.parse({ status: "disabled" }).status).toBe("disabled");
    expect(weatherResponseSchema.parse({ status: "unavailable" }).status).toBe("unavailable");
  });
});

describe("weatherCodeToCondition", () => {
  it("maps known WMO codes", () => {
    expect(weatherCodeToCondition(0)).toBe("Clear");
    expect(weatherCodeToCondition(61)).toBe("Rain");
  });

  it("returns Unknown for unmapped codes", () => {
    expect(weatherCodeToCondition(12345)).toBe("Unknown");
  });
});
