import { describe, expect, it, vi } from "vitest";
import {
  fetchSettings,
  fetchTelemetry,
  getAgentLastSeenMs,
  type PanelState,
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

describe("fetchTelemetry", () => {
  it("returns empty on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({ status: "empty" });
    vi.unstubAllGlobals();
  });

  it("returns ready state for valid telemetry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => readyTelemetry,
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({
      status: "ready",
      telemetry: readyTelemetry,
    });
    vi.unstubAllGlobals();
  });

  it("returns error on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({
      status: "error",
      message: "API error (500)",
    });
    vi.unstubAllGlobals();
  });

  it("returns error when response fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ appName: "Code" }),
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({
      status: "error",
      message: "Invalid telemetry response",
    });
    vi.unstubAllGlobals();
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
        status: 502,
      }),
    );

    await expect(reverseGeocodeCity(50.45, 30.52)).rejects.toThrow("Reverse geocoding HTTP 502");
    vi.unstubAllGlobals();
  });
});
