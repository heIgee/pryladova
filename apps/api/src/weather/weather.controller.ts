import { Controller, Get, Query } from "@nestjs/common";
import { WEATHER_ROUTE, type WeatherResponse } from "@pryladova/shared";
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
  async getWeather(
    @Query("lat") latRaw?: string,
    @Query("lon") lonRaw?: string,
    @Query("refresh") refreshRaw?: string,
  ): Promise<WeatherResponse> {
    return this.weatherService.getWeather(
      parseCoord(latRaw),
      parseCoord(lonRaw),
      parseRefresh(refreshRaw),
    );
  }
}
