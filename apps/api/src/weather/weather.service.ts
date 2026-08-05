import { Injectable } from "@nestjs/common";
import { type WeatherResponse, weatherCodeToCondition } from "@pryladova/shared";
import { z } from "zod";

const CACHE_TTL_MS = 30 * 60 * 1000;

const openMeteoCurrentSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    weather_code: z.number().int(),
  }),
});

type CachedReady = Extract<WeatherResponse, { status: "ready" }>;

const isValidCoord = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180;

@Injectable()
export class WeatherService {
  private readonly cache = new Map<string, { ready: CachedReady; expiresAt: number }>();

  async getWeather(
    queryLat?: number,
    queryLon?: number,
    refresh = false,
  ): Promise<WeatherResponse> {
    const coords = this.resolveCoords(queryLat, queryLon);
    if (!coords) {
      return { status: "disabled" };
    }

    const cacheKey = `${coords.lat},${coords.lon}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (!refresh && cached !== undefined && now < cached.expiresAt) {
      return cached.ready;
    }

    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(coords.lat));
      url.searchParams.set("longitude", String(coords.lon));
      url.searchParams.set("current", "temperature_2m,weather_code");
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }

      const json: unknown = await response.json();
      const parsed = openMeteoCurrentSchema.parse(json);
      const ready: CachedReady = {
        status: "ready",
        temperatureC: parsed.current.temperature_2m,
        weatherCode: parsed.current.weather_code,
        condition: weatherCodeToCondition(parsed.current.weather_code),
        fetchedAt: new Date().toISOString(),
      };

      this.cache.set(cacheKey, { ready, expiresAt: now + CACHE_TTL_MS });
      return ready;
    } catch (error: unknown) {
      if (cached !== undefined) {
        return cached.ready;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] weather fetch failed: ${message}`);
      return { status: "unavailable" };
    }
  }

  private resolveCoords(queryLat?: number, queryLon?: number): { lat: number; lon: number } | null {
    if (queryLat !== undefined && queryLon !== undefined && isValidCoord(queryLat, queryLon)) {
      return { lat: queryLat, lon: queryLon };
    }

    return null;
  }
}
