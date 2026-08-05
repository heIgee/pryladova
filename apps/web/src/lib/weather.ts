import { WEATHER_ROUTE, type WeatherResponse, weatherResponseSchema } from "@pryladova/shared";
import { z } from "zod";
import type { WeatherLocation } from "./weather-location.js";

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

export type GeocodeResult = {
  label: string;
  lat: number;
  lon: number;
};

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

const reverseGeocodeSchema = z.object({
  city: z.string().optional(),
  locality: z.string().optional(),
  principalSubdivision: z.string().optional(),
  countryName: z.string().optional(),
});

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

export const buildWeatherUrl = (
  location?: WeatherLocation | null,
  options?: { refresh?: boolean },
): string => {
  const params = new URLSearchParams();
  if (location) {
    params.set("lat", String(location.lat));
    params.set("lon", String(location.lon));
  }
  if (options?.refresh) {
    params.set("refresh", "1");
  }
  const query = params.toString();
  return query.length > 0 ? `${WEATHER_ROUTE}?${query}` : WEATHER_ROUTE;
};

export const fetchWeather = async (
  location?: WeatherLocation | null,
  options?: { refresh?: boolean },
): Promise<WeatherResponse> => {
  try {
    const response = await fetch(buildWeatherUrl(location, options));
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const json: unknown = await response.json();
    return weatherResponseSchema.parse(json);
  } catch {
    return { status: "unavailable" };
  }
};

export const searchWeatherCities = async (query: string): Promise<GeocodeResult[]> => {
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

  return results.map((result) => ({
    label: formatGeocodeLabel(result),
    lat: result.latitude,
    lon: result.longitude,
  }));
};

export const reverseGeocodeCity = async (lat: number, lon: number): Promise<GeocodeResult> => {
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
};
