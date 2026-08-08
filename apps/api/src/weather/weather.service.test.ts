import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherService } from "./weather.service.js";

const createService = async (): Promise<WeatherService> => {
  const moduleRef = await Test.createTestingModule({
    providers: [WeatherService],
  }).compile();
  return moduleRef.get(WeatherService);
};

describe("WeatherService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns disabled without coordinates", async () => {
    const service = await createService();
    await expect(service.getWeather()).resolves.toEqual({ status: "disabled" });
  });

  it("evicts expired cache entries on subsequent lookups", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 10, weather_code: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 12, weather_code: 1 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService();

    const first = await service.getWeather(50.45, 30.52);
    expect(first.status).toBe("ready");
    if (first.status === "ready") {
      expect(first.temperatureC).toBe(10);
    }

    vi.setSystemTime(new Date("2026-01-01T13:00:00.000Z"));
    const second = await service.getWeather(50.45, 30.52);
    expect(second.status).toBe("ready");
    if (second.status === "ready") {
      expect(second.temperatureC).toBe(12);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns stale cache when a refresh fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 10, weather_code: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService();
    const first = await service.getWeather(50.45, 30.52);
    expect(first.status).toBe("ready");
    if (first.status === "ready") {
      expect(first.temperatureC).toBe(10);
    }

    const second = await service.getWeather(50.45, 30.52, true);
    expect(second.status).toBe("ready");
    if (second.status === "ready") {
      expect(second.temperatureC).toBe(10);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("formats reverse geocode label from city", async () => {
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

    const service = await createService();
    await expect(service.reverseGeocode(50.45, 30.52)).resolves.toEqual({
      label: "Kyiv, Kyiv City, Ukraine",
      lat: 50.45,
      lon: 30.52,
    });
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

    const service = await createService();
    await expect(service.reverseGeocode(40.65, -73.95)).resolves.toEqual({
      label: "Brooklyn, New York, United States",
      lat: 40.65,
      lon: -73.95,
    });
  });

  it("rejects invalid coordinates", async () => {
    const service = await createService();
    await expect(service.reverseGeocode(999, 30.52)).rejects.toThrow("Invalid coordinates");
  });
});
