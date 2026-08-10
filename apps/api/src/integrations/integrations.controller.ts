import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  GITHUB_STATUS_ROUTE,
  type GithubStatusResponse,
  GOOGLE_CALENDAR_STATUS_ROUTE,
  GOOGLE_TASKS_STATUS_ROUTE,
  type GoogleCalendarStatusResponse,
  type GoogleTasksStatusResponse,
  parseGithubStatusResponse,
  parseGoogleCalendarStatusResponse,
  parseGoogleTasksStatusResponse,
  parseSteamStatusResponse,
  STEAM_STATUS_ROUTE,
  type SteamStatusResponse,
} from "@pryladova/shared";
import { GithubService } from "./github.service.js";
import { GoogleCalendarService } from "./google-calendar.service.js";
import { GoogleTasksService } from "./google-tasks.service.js";
import { SteamService } from "./steam.service.js";

const parseRefresh = (value: string | undefined): boolean => value === "1" || value === "true";

@Controller()
export class IntegrationsController {
  constructor(
    private readonly githubService: GithubService,
    private readonly steamService: SteamService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly googleTasksService: GoogleTasksService,
  ) {}

  @Get(GITHUB_STATUS_ROUTE)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getGithubStatus(@Query("refresh") refreshRaw?: string): Promise<GithubStatusResponse> {
    const response = await this.githubService.getStatus(parseRefresh(refreshRaw));
    return parseGithubStatusResponse(response);
  }

  @Get(STEAM_STATUS_ROUTE)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getSteamStatus(@Query("refresh") refreshRaw?: string): Promise<SteamStatusResponse> {
    const response = await this.steamService.getStatus(parseRefresh(refreshRaw));
    return parseSteamStatusResponse(response);
  }

  @Get(GOOGLE_CALENDAR_STATUS_ROUTE)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getGoogleCalendarStatus(
    @Query("refresh") refreshRaw?: string,
  ): Promise<GoogleCalendarStatusResponse> {
    const response = await this.googleCalendarService.getStatus(parseRefresh(refreshRaw));
    return parseGoogleCalendarStatusResponse(response);
  }

  @Get(GOOGLE_TASKS_STATUS_ROUTE)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getGoogleTasksStatus(
    @Query("refresh") refreshRaw?: string,
  ): Promise<GoogleTasksStatusResponse> {
    const response = await this.googleTasksService.getStatus(parseRefresh(refreshRaw));
    return parseGoogleTasksStatusResponse(response);
  }
}
