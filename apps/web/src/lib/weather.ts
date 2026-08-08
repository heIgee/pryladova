import {
  geocodeCitiesResponseSchema,
  geocodeCitySchema,
  WEATHER_CITIES_ROUTE,
  WEATHER_REVERSE_ROUTE,
  WEATHER_ROUTE,
  type WeatherResponse,
  weatherResponseSchema,
} from "@pryladova/shared";
import { apiFetch } from "./api-fetch.js";
import type { WeatherLocation } from "./weather-location.js";

export type GeocodeResult = {
  label: string;
  lat: number;
  lon: number;
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
    const response = await apiFetch(buildWeatherUrl(location, options));
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

  const params = new URLSearchParams({ q: trimmed });
  const response = await apiFetch(`${WEATHER_CITIES_ROUTE}?${params}`);
  if (!response.ok) {
    throw new Error(`City search HTTP ${response.status}`);
  }

  const json: unknown = await response.json();
  return geocodeCitiesResponseSchema.parse(json);
};

export const reverseGeocodeCity = async (lat: number, lon: number): Promise<GeocodeResult> => {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  const response = await apiFetch(`${WEATHER_REVERSE_ROUTE}?${params}`);
  if (!response.ok) {
    throw new Error(`Reverse geocoding HTTP ${response.status}`);
  }

  const json: unknown = await response.json();
  return geocodeCitySchema.parse(json);
};
