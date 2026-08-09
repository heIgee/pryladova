import { describe, expect, it } from "vitest";
import {
  agentWsInboundSchema,
  hostMediaSchema,
  hostPayloadForPanelWs,
  isRedactedTelemetry,
  mergeHostPayload,
  normalizeAppName,
  panelWsMessageSchema,
  SECURE_APP_NAME,
  SECURE_WINDOW_TITLE,
  settingsSchema,
  telemetryPayloadSchema,
  weatherCodeToCondition,
  weatherResponseSchema,
} from "./index.js";

describe("normalizeAppName", () => {
  it("trims whitespace and rejects empty values", () => {
    expect(normalizeAppName(" Code ")).toBe("Code");
    expect(normalizeAppName("   ")).toBeNull();
  });
});

describe("telemetryPayloadSchema", () => {
  it("trims app and window names on parse", () => {
    expect(
      telemetryPayloadSchema.parse({
        appName: " Code ",
        windowTitle: " app.tsx ",
        capturedAt: "2026-01-01T12:00:00.000Z",
      }),
    ).toEqual({
      appName: "Code",
      windowTitle: "app.tsx",
      capturedAt: "2026-01-01T12:00:00.000Z",
    });
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

describe("agentWsInboundSchema", () => {
  it("parses update and shutdown messages with agentId", () => {
    expect(
      agentWsInboundSchema.parse({
        type: "update",
        agentId: "desk-pc",
        host: {
          idleMs: 0,
          cpuPercent: 1,
          ramPercent: 2,
          uptimeSec: 3,
          media: null,
          capturedAt: "2026-01-01T12:00:00.000Z",
        },
      }).type,
    ).toBe("update");

    expect(
      agentWsInboundSchema.parse({
        type: "shutdown",
        agentId: "desk-pc",
        capturedAt: "2026-01-01T12:00:00.000Z",
      }).type,
    ).toBe("shutdown");
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

  it("rejects oversized thumbnail data url", () => {
    expect(() =>
      hostMediaSchema.parse({
        title: "Track",
        artist: null,
        albumTitle: null,
        appName: null,
        playbackStatus: "playing",
        thumbnailDataUrl: `data:image/jpeg;base64,${"a".repeat(512_001)}`,
      }),
    ).toThrow();
  });
});

describe("panel host ws helpers", () => {
  it("parses host-only panel websocket messages", () => {
    expect(
      panelWsMessageSchema.parse({
        type: "host",
        host: {
          idleMs: 0,
          cpuPercent: 10,
          ramPercent: 20,
          uptimeSec: 100,
          media: null,
          capturedAt: "2026-01-01T12:00:00.000Z",
        },
      }),
    ).toMatchObject({ type: "host" });
  });

  it("strips thumbnails from host-only payloads", () => {
    expect(
      hostPayloadForPanelWs({
        idleMs: 0,
        cpuPercent: 10,
        ramPercent: 20,
        uptimeSec: 100,
        capturedAt: "2026-01-01T12:00:00.000Z",
        media: {
          title: "Track",
          artist: "Artist",
          albumTitle: null,
          appName: "Player",
          playbackStatus: "playing",
          thumbnailDataUrl: "data:image/jpeg;base64,abc",
        },
      }).media?.thumbnailDataUrl,
    ).toBeNull();
  });

  it("preserves thumbnails across unchanged tracks", () => {
    const previous = {
      idleMs: 0,
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSec: 100,
      capturedAt: "2026-01-01T12:00:00.000Z",
      media: {
        title: "Track",
        artist: "Artist",
        albumTitle: null,
        appName: "Player",
        playbackStatus: "playing" as const,
        thumbnailDataUrl: "data:image/jpeg;base64,abc",
      },
    };
    const incoming = {
      ...previous,
      cpuPercent: 12,
      capturedAt: "2026-01-01T12:00:02.000Z",
      media: previous.media ? { ...previous.media, thumbnailDataUrl: null } : null,
    };

    expect(mergeHostPayload(previous, incoming).media?.thumbnailDataUrl).toBe(
      "data:image/jpeg;base64,abc",
    );
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
