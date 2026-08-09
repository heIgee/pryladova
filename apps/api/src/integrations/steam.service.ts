import { Injectable } from "@nestjs/common";
import {
  parseSteamStatusResponse,
  type SteamPersonaState,
  type SteamStatusResponse,
} from "@pryladova/shared";
import { z } from "zod";
import { ConfigService } from "../config.service.js";
import {
  createSteamSessionState,
  type SteamSessionState,
  updateSteamSession,
} from "./steam-session.logic.js";

const CACHE_TTL_MS = 10 * 60 * 1000;

const playerSummariesSchema = z.object({
  response: z.object({
    players: z
      .array(
        z.object({
          personaname: z.string().min(1),
          personastate: z.number().int(),
          gameextrainfo: z.string().optional(),
          gameid: z.string().optional(),
          avatarfull: z.string().optional(),
          profileurl: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

const recentlyPlayedSchema = z.object({
  response: z.object({
    games: z
      .array(
        z.object({
          appid: z.number().int().positive(),
          name: z.string().min(1),
          playtime_2weeks: z.number().int().nonnegative(),
          img_icon_url: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

type CachedReady = Extract<SteamStatusResponse, { status: "ready" }>;

const mapPersonaState = (personastate: number, inGame: boolean): SteamPersonaState => {
  if (inGame && personastate > 0) {
    return personastate === 2 ? "busy" : "online";
  }
  switch (personastate) {
    case 1:
      return "online";
    case 2:
      return "busy";
    case 3:
      return "away";
    case 4:
      return "snooze";
    default:
      return "offline";
  }
};

const steamIconUrl = (appId: number, iconPath: string | undefined): string | null => {
  if (!iconPath) {
    return null;
  }
  const file = iconPath.endsWith(".jpg") ? iconPath : `${iconPath}.jpg`;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${file}`;
};

@Injectable()
export class SteamService {
  private cached: { ready: CachedReady; expiresAt: number } | null = null;
  private sessionState: SteamSessionState = createSteamSessionState();

  constructor(private readonly configService: ConfigService) {}

  async getStatus(refresh = false): Promise<SteamStatusResponse> {
    const { steamApiKey, steamId } = this.configService.config;
    if (!steamApiKey || !steamId) {
      return parseSteamStatusResponse({ status: "disabled" });
    }

    const now = Date.now();
    if (!refresh && this.cached !== null && now < this.cached.expiresAt) {
      return this.cached.ready;
    }

    try {
      const ready = await this.fetchStatus(steamApiKey, steamId, now);
      this.cached = { ready, expiresAt: now + CACHE_TTL_MS };
      return ready;
    } catch (error: unknown) {
      if (this.cached !== null) {
        return this.cached.ready;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] steam status fetch failed: ${message}`);
      return parseSteamStatusResponse({ status: "unavailable" });
    }
  }

  private async fetchStatus(apiKey: string, steamId: string, nowMs: number): Promise<CachedReady> {
    const summariesUrl = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
    summariesUrl.searchParams.set("key", apiKey);
    summariesUrl.searchParams.set("steamids", steamId);

    const recentUrl = new URL(
      "https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/",
    );
    recentUrl.searchParams.set("key", apiKey);
    recentUrl.searchParams.set("steamid", steamId);
    recentUrl.searchParams.set("count", "5");

    const [summariesRes, recentRes] = await Promise.all([fetch(summariesUrl), fetch(recentUrl)]);

    if (!summariesRes.ok) {
      throw new Error(`Steam summaries HTTP ${summariesRes.status}`);
    }
    if (!recentRes.ok) {
      throw new Error(`Steam recently played HTTP ${recentRes.status}`);
    }

    const summariesJson: unknown = await summariesRes.json();
    const recentJson: unknown = await recentRes.json();
    const summaries = playerSummariesSchema.parse(summariesJson);
    const recent = recentlyPlayedSchema.parse(recentJson);

    const player = summaries.response.players?.[0];
    if (!player) {
      throw new Error("Steam player not found");
    }

    const gameId = player.gameid ? Number.parseInt(player.gameid, 10) : null;
    const validGameId = gameId !== null && Number.isFinite(gameId) ? gameId : null;
    this.sessionState = updateSteamSession(this.sessionState, validGameId, nowMs);

    const inGame = Boolean(player.gameextrainfo);
    const personaState = mapPersonaState(player.personastate, inGame);
    const currentGame =
      player.gameextrainfo && validGameId !== null
        ? {
            name: player.gameextrainfo,
            sessionSec: this.sessionState.sessionSec,
          }
        : null;

    const recentlyPlayed = (recent.response.games ?? []).map((game) => ({
      name: game.name,
      playtime2WeeksMin: game.playtime_2weeks,
      iconUrl: steamIconUrl(game.appid, game.img_icon_url),
    }));

    return parseSteamStatusResponse({
      status: "ready",
      username: player.personaname,
      personaState,
      avatarUrl: player.avatarfull ?? null,
      profileUrl: player.profileurl ?? null,
      currentGame,
      recentlyPlayed,
      fetchedAt: new Date().toISOString(),
    }) as CachedReady;
  }
}
