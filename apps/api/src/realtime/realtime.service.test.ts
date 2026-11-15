import { panelWsMessageSchema, type TelemetryState } from "@pryladova/shared";
import { describe, expect, it } from "vitest";
import { RealtimeService } from "./realtime.service.js";

const host = {
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

const telemetry: TelemetryState = {
  appName: "Code",
  windowTitle: "app.tsx",
  capturedAt: "2026-01-01T12:00:00.000Z",
  receivedAt: "2026-01-01T12:00:00.100Z",
  classification: { category: "Coding", displayAppName: "VS Code", workRelated: "yes" },
  classificationStatus: "ready",
  host,
};

describe("RealtimeService", () => {
  it("builds empty panel messages", () => {
    const service = new RealtimeService();
    expect(service.buildPanelMessage(null)).toEqual({ type: "empty" });
  });

  it("emits panel messages that satisfy the shared WS contract", () => {
    const service = new RealtimeService();
    const messages = [
      service.buildPanelMessage(null),
      service.buildPanelMessage(telemetry),
      service.buildPanelHostMessage(host),
    ];

    for (const message of messages) {
      expect(panelWsMessageSchema.safeParse(JSON.parse(JSON.stringify(message))).success).toBe(
        true,
      );
    }
  });

  it("strips thumbnails from host-only panel messages", () => {
    const service = new RealtimeService();
    expect(
      service.buildPanelHostMessage({
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
      }),
    ).toEqual({
      type: "host",
      host: {
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
          thumbnailDataUrl: null,
        },
      },
    });
  });
});
