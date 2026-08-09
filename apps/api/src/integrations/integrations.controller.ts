import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  GITHUB_STATUS_ROUTE,
  type GithubStatusResponse,
  parseGithubStatusResponse,
  parseSteamStatusResponse,
  STEAM_STATUS_ROUTE,
  type SteamStatusResponse,
} from "@pryladova/shared";
import { GithubService } from "./github.service.js";
import { SteamService } from "./steam.service.js";

const parseRefresh = (value: string | undefined): boolean => value === "1" || value === "true";

@Controller()
export class IntegrationsController {
  constructor(
    private readonly githubService: GithubService,
    private readonly steamService: SteamService,
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
}
