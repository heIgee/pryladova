import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type GeocodeCity,
  parseGeocodeCitiesResponse,
  parseGeocodeCity,
  parseWeatherResponse,
  WEATHER_CITIES_ROUTE,
  WEATHER_REVERSE_ROUTE,
  WEATHER_ROUTE,
  type WeatherResponse,
} from "@pryladova/shared";
import { WeatherService } from "./weather.service.js";

const parseCoord = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseRefresh = (value: string | undefined): boolean => value === "1" || value === "true";

@Controller()
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get(WEATHER_ROUTE)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getWeather(
    @Query("lat") latRaw?: string,
    @Query("lon") lonRaw?: string,
    @Query("refresh") refreshRaw?: string,
  ): Promise<WeatherResponse> {
    const response = await this.weatherService.getWeather(
      parseCoord(latRaw),
      parseCoord(lonRaw),
      parseRefresh(refreshRaw),
    );
    return parseWeatherResponse(response);
  }

  @Get(WEATHER_CITIES_ROUTE)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async searchCities(@Query("q") queryRaw?: string): Promise<GeocodeCity[]> {
    const results = await this.weatherService.searchCities(queryRaw?.trim() ?? "");
    return parseGeocodeCitiesResponse(results);
  }

  @Get(WEATHER_REVERSE_ROUTE)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async reverseGeocode(
    @Query("lat") latRaw?: string,
    @Query("lon") lonRaw?: string,
  ): Promise<GeocodeCity> {
    const lat = parseCoord(latRaw);
    const lon = parseCoord(lonRaw);
    if (lat === undefined || lon === undefined) {
      throw new BadRequestException("lat and lon query parameters are required");
    }
    const result = await this.weatherService.reverseGeocode(lat, lon);
    return parseGeocodeCity(result);
  }
}
