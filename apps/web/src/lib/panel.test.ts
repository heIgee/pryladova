import { describe, expect, it, vi } from "vitest";
import { fetchTelemetry, getAgentLastSeenMs, type PanelState } from "./panel.js";
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
  it("returns closest city label from coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          city: "Kyiv",
          principalSubdivision: "Kyiv City",
          countryName: "Ukraine",
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

  it("uses locality when city is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          locality: "Brooklyn",
          principalSubdivision: "New York",
          countryName: "United States",
        }),
      }),
    );

    await expect(reverseGeocodeCity(40.65, -73.95)).resolves.toEqual({
      label: "Brooklyn, New York, United States",
      lat: 40.65,
      lon: -73.95,
    });
    vi.unstubAllGlobals();
  });
});
