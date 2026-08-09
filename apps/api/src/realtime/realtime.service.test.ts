import { describe, expect, it } from "vitest";
import { RealtimeService } from "./realtime.service.js";

describe("RealtimeService", () => {
  it("builds empty panel messages", () => {
    const service = new RealtimeService();
    expect(service.buildPanelMessage(null)).toEqual({ type: "empty" });
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
