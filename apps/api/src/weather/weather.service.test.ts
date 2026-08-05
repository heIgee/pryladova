import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherService } from "./weather.service.js";

describe("WeatherService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 18.2, weather_code: 61 },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns disabled when coordinates are missing", async () => {
    const service = new WeatherService();
    await expect(service.getWeather()).resolves.toEqual({ status: "disabled" });
  });

  it("returns ready weather from Open-Meteo", async () => {
    const service = new WeatherService();
    const result = await service.getWeather(50.45, 30.52);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.temperatureC).toBe(18.2);
      expect(result.weatherCode).toBe(61);
      expect(result.condition).toBe("Rain");
    }
  });

  it("returns cached ready response on fetch failure", async () => {
    const service = new WeatherService();
    const first = await service.getWeather(50.45, 30.52);
    expect(first.status).toBe("ready");

    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    const second = await service.getWeather(50.45, 30.52);
    expect(second).toEqual(first);
  });

  it("returns unavailable when fetch fails without cache", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    const service = new WeatherService();
    await expect(service.getWeather(50.45, 30.52)).resolves.toEqual({ status: "unavailable" });
  });

  it("bypasses cache when refresh is true", async () => {
    const service = new WeatherService();
    await service.getWeather(50.45, 30.52);
    await service.getWeather(50.45, 30.52, true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
