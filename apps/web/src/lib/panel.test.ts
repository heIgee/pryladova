import { describe, expect, it, vi } from "vitest";
import {
  applyPanelWsMessage,
  fetchSettings,
  getAgentLastSeenMs,
  isAgentLive,
  isAgentStale,
  type PanelState,
  resolvePanelSubtitle,
  resolveShowAgentHint,
  shouldShowMediaTile,
  syncSettings,
} from "./panel.js";
import { buildWeatherUrl, fetchWeather, reverseGeocodeCity } from "./weather.js";

const readyTelemetry = {
  appName: "Code",
  windowTitle: "app.tsx",
  capturedAt: "2026-01-01T12:00:00.000Z",
  receivedAt: "2026-01-01T12:00:01.000Z",
  classification: null,
  classificationStatus: "disabled" as const,
  host: {
    idleMs: 0,
    cpuPercent: 10,
    ramPercent: 20,
    uptimeSec: 100,
    media: null,
    capturedAt: "2026-01-01T12:00:02.000Z",
  },
};

describe("applyPanelWsMessage", () => {
  it("ignores empty websocket messages while panel already has live state", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };

    expect(applyPanelWsMessage(panel, { type: "empty" })).toEqual(panel);
  });

  it("ignores host-only websocket updates while panel is still loading", () => {
    const panel: PanelState = { status: "loading" };

    const next = applyPanelWsMessage(panel, {
      type: "host",
      host: {
        idleMs: 0,
        cpuPercent: 55,
        ramPercent: 20,
        uptimeSec: 100,
        media: null,
        capturedAt: "2026-01-01T12:00:05.000Z",
      },
    });

    expect(next).toEqual({ status: "loading" });
  });

  it("merges host-only websocket updates into ready panel state", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };

    const next = applyPanelWsMessage(panel, {
      type: "host",
      host: {
        idleMs: 0,
        cpuPercent: 55,
        ramPercent: 20,
        uptimeSec: 100,
        media: null,
        capturedAt: "2026-01-01T12:00:05.000Z",
      },
    });

    expect(next).toEqual({
      status: "ready",
      telemetry: expect.objectContaining({
        appName: "Code",
        host: expect.objectContaining({ cpuPercent: 55 }),
      }),
    });
  });

  it("preserves thumbnail when a reconnect state snapshot omits it for the same track", () => {
    const panel: PanelState = {
      status: "ready",
      telemetry: {
        ...readyTelemetry,
        host: {
          idleMs: 0,
          cpuPercent: 10,
          ramPercent: 20,
          uptimeSec: 100,
          capturedAt: "2026-01-01T12:00:02.000Z",
          media: {
            title: "Track",
            artist: "Artist",
            albumTitle: null,
            appName: "Player",
            playbackStatus: "playing",
            thumbnailDataUrl: "data:image/jpeg;base64,abc",
          },
        },
      },
    };

    const next = applyPanelWsMessage(panel, {
      type: "state",
      telemetry: {
        appName: "Code",
        windowTitle: "app.tsx",
        capturedAt: "2026-01-01T12:00:06.000Z",
        receivedAt: "2026-01-01T12:00:06.000Z",
        classification: null,
        classificationStatus: "disabled",
        host: {
          idleMs: 0,
          cpuPercent: 55,
          ramPercent: 20,
          uptimeSec: 110,
          capturedAt: "2026-01-01T12:00:06.000Z",
          media: {
            title: "Track",
            artist: "Artist",
            albumTitle: null,
            appName: "Player",
            playbackStatus: "playing",
            thumbnailDataUrl: null,
          },
        },
      },
    });

    expect(next).toEqual({
      status: "ready",
      telemetry: expect.objectContaining({
        appName: "Code",
        host: expect.objectContaining({
          cpuPercent: 55,
          media: expect.objectContaining({
            thumbnailDataUrl: "data:image/jpeg;base64,abc",
          }),
        }),
      }),
    });
  });
});

describe("fetchSettings", () => {
  it("returns parsed settings on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ classificationEnabled: true }),
      }),
    );

    await expect(fetchSettings()).resolves.toEqual({ classificationEnabled: true });
    vi.unstubAllGlobals();
  });

  it("throws on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(fetchSettings()).rejects.toThrow("Settings error (500)");
    vi.unstubAllGlobals();
  });
});

describe("syncSettings", () => {
  it("throws on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    await expect(syncSettings(true)).rejects.toThrow("Settings error (401)");
    vi.unstubAllGlobals();
  });
});

describe("shouldShowMediaTile", () => {
  it("is false when host is undefined", () => {
    expect(shouldShowMediaTile(undefined)).toBe(false);
  });

  it("is false when host media is null", () => {
    expect(
      shouldShowMediaTile({
        idleMs: 0,
        cpuPercent: 0,
        ramPercent: 0,
        uptimeSec: 0,
        media: null,
        capturedAt: "2026-01-01T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("is true when host media exists", () => {
    expect(
      shouldShowMediaTile({
        idleMs: 0,
        cpuPercent: 0,
        ramPercent: 0,
        uptimeSec: 0,
        media: {
          title: "Track",
          artist: "Artist",
          albumTitle: null,
          appName: null,
          playbackStatus: "playing" as const,
          thumbnailDataUrl: null,
        },
        capturedAt: "2026-01-01T12:00:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("getAgentLastSeenMs", () => {
  it("returns null for non-ready panels", () => {
    const panel: PanelState = { status: "empty" };
    expect(getAgentLastSeenMs(panel)).toBeNull();
  });

  it("returns latest timestamp from telemetry and host", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    expect(getAgentLastSeenMs(panel)).toBe(Date.parse("2026-01-01T12:00:02.000Z"));
  });
});

describe("isAgentStale", () => {
  it("is false when host was seen within the threshold", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    const now = Date.parse("2026-01-01T12:00:02.000Z") + 5_000;
    expect(isAgentStale(panel, now)).toBe(false);
  });

  it("is true when host was last seen beyond the threshold", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    const now = Date.parse("2026-01-01T12:00:02.000Z") + 10_000;
    expect(isAgentStale(panel, now)).toBe(true);
  });
});

describe("isAgentLive", () => {
  it("is false when the panel is empty", () => {
    expect(isAgentLive({ status: "empty" })).toBe(false);
  });

  it("is true when ready telemetry is fresh", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    const now = Date.parse("2026-01-01T12:00:02.000Z") + 5_000;
    expect(isAgentLive(panel, now)).toBe(true);
  });
});

describe("resolvePanelSubtitle", () => {
  it("reports api-unavailable when the panel stream is disconnected", () => {
    expect(resolvePanelSubtitle({ status: "loading" }, false)).toBe("api-unavailable");
    expect(resolvePanelSubtitle({ status: "ready", telemetry: readyTelemetry }, false)).toBe(
      "api-unavailable",
    );
  });

  it("reports agent-unavailable when the stream is connected but the agent is missing", () => {
    expect(resolvePanelSubtitle({ status: "empty" }, true)).toBe("agent-unavailable");
  });

  it("reports live when the stream is connected and telemetry is fresh", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    const now = Date.parse("2026-01-01T12:00:02.000Z") + 5_000;
    expect(resolvePanelSubtitle(panel, true, now)).toBe("live");
  });
});

describe("resolveShowAgentHint", () => {
  it("is false while the panel stream is loading", () => {
    expect(resolveShowAgentHint({ status: "loading" })).toBe(false);
  });

  it("is true when the agent has never connected", () => {
    expect(resolveShowAgentHint({ status: "empty" })).toBe(true);
  });

  it("is true when ready telemetry is stale", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    const now = Date.parse("2026-01-01T12:00:02.000Z") + 10_000;
    expect(resolveShowAgentHint(panel, now)).toBe(true);
  });
});

describe("fetchWeather", () => {
  it("builds query url for stored location", () => {
    expect(buildWeatherUrl({ lat: 50.45, lon: 30.52, label: "Kyiv, Ukraine" })).toBe(
      "/api/weather?lat=50.45&lon=30.52",
    );
  });

  it("adds refresh param when requested", () => {
    expect(buildWeatherUrl(null, { refresh: true })).toBe("/api/weather?refresh=1");
    expect(buildWeatherUrl({ lat: 50.45, lon: 30.52, label: "Kyiv" }, { refresh: true })).toBe(
      "/api/weather?lat=50.45&lon=30.52&refresh=1",
    );
  });

  it("returns parsed ready weather", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ready",
          temperatureC: 19,
          weatherCode: 0,
          condition: "Clear",
          fetchedAt: "2026-01-01T12:00:00.000Z",
        }),
      }),
    );

    await expect(fetchWeather()).resolves.toEqual({
      status: "ready",
      temperatureC: 19,
      weatherCode: 0,
      condition: "Clear",
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    vi.unstubAllGlobals();
  });

  it("returns unavailable on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(fetchWeather()).resolves.toEqual({ status: "unavailable" });
    vi.unstubAllGlobals();
  });
});

describe("reverseGeocodeCity", () => {
  it("parses geocode JSON from the reverse-geocode API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          label: "Kyiv, Kyiv City, Ukraine",
          lat: 50.45,
          lon: 30.52,
        }),
      }),
    );

    await expect(reverseGeocodeCity(50.45, 30.52)).resolves.toEqual({
      label: "Kyiv, Kyiv City, Ukraine",
      lat: 50.45,
      lon: 30.52,
    });
    vi.unstubAllGlobals();
  });

  it("throws when reverse geocode request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(reverseGeocodeCity(50.45, 30.52)).rejects.toThrow("Reverse geocoding HTTP 500");
    vi.unstubAllGlobals();
  });
});
