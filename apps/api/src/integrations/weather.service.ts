import { Injectable } from "@nestjs/common";
import {
  type GeocodeCity,
  parseGeocodeCitiesResponse,
  parseWeatherResponse,
  type WeatherResponse,
  weatherCodeToCondition,
} from "@pryladova/shared";
import { z } from "zod";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 128;

const openMeteoCurrentSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    weather_code: z.number().int(),
  }),
});

const geocodeResultSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

const reverseGeocodeSchema = z.object({
  city: z.string().optional(),
  locality: z.string().optional(),
  principalSubdivision: z.string().optional(),
  countryName: z.string().optional(),
});

type CachedReady = Extract<WeatherResponse, { status: "ready" }>;

const isValidCoord = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180;

const formatGeocodeLabel = (result: {
  name: string;
  country?: string;
  admin1?: string;
}): string => {
  const parts = [result.name];
  if (result.admin1) {
    parts.push(result.admin1);
  }
  if (result.country) {
    parts.push(result.country);
  }
  return parts.join(", ");
};

const formatReverseGeocodeLabel = (result: {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}): string | null => {
  const name = result.city?.trim() || result.locality?.trim();
  if (!name) {
    return null;
  }

  const parts = [name];
  const admin = result.principalSubdivision?.trim();
  if (admin && admin !== name) {
    parts.push(admin);
  }
  const country = result.countryName?.trim();
  if (country) {
    parts.push(country);
  }
  return parts.join(", ");
};

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
      return parseWeatherResponse({ status: "disabled" });
    }

    this.evictExpiredEntries();

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
      const ready = parseWeatherResponse({
        status: "ready",
        temperatureC: parsed.current.temperature_2m,
        weatherCode: parsed.current.weather_code,
        condition: weatherCodeToCondition(parsed.current.weather_code),
        fetchedAt: new Date().toISOString(),
      }) as CachedReady;

      this.cache.set(cacheKey, { ready, expiresAt: now + CACHE_TTL_MS });
      this.trimCache();
      return ready;
    } catch (error: unknown) {
      if (cached !== undefined) {
        return cached.ready;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] weather fetch failed: ${message}`);
      return parseWeatherResponse({ status: "unavailable" });
    }
  }

  async searchCities(query: string): Promise<GeocodeCity[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", trimmed);
    url.searchParams.set("count", "6");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    const parsed = geocodeResultSchema.parse(json);
    const results = parsed.results ?? [];

    return parseGeocodeCitiesResponse(
      results.map((result) => ({
        label: formatGeocodeLabel(result),
        lat: result.latitude,
        lon: result.longitude,
      })),
    );
  }

  async reverseGeocode(lat: number, lon: number): Promise<GeocodeCity> {
    if (!isValidCoord(lat, lon)) {
      throw new Error("Invalid coordinates");
    }

    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("localityLanguage", "en");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Reverse geocoding HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    const parsed = reverseGeocodeSchema.parse(json);
    const label = formatReverseGeocodeLabel(parsed);
    if (!label) {
      throw new Error("No city found for coordinates");
    }

    return { label, lat, lon };
  }

  private resolveCoords(queryLat?: number, queryLon?: number): { lat: number; lon: number } | null {
    if (queryLat !== undefined && queryLon !== undefined && isValidCoord(queryLat, queryLon)) {
      return { lat: queryLat, lon: queryLon };
    }

    return null;
  }

  private evictExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private trimCache(): void {
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.cache.delete(oldest);
    }
  }
}
