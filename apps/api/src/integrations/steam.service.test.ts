import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../config.js";
import { ConfigService } from "../config.service.js";
import { SteamService } from "./steam.service.js";

const steamConfig: ApiConfig = {
  geminiApiKey: undefined,
  geminiModel: "gemini-3.1-flash-lite",
  ingestSecret: undefined,
  sentryDsn: undefined,
  sessionSecret: undefined,
  panelPasswordHash: undefined,
  supabaseUrl: undefined,
  supabaseSecretKey: undefined,
  githubToken: undefined,
  githubUsername: undefined,
  steamApiKey: "steam-key",
  steamId: "76561198000000000",
  googleClientId: undefined,
  googleClientSecret: undefined,
  googleRedirectUri: undefined,
  googleRefreshToken: undefined,
  integrationEncryptionKey: undefined,
};

const createService = async (): Promise<SteamService> => {
  const moduleRef = await Test.createTestingModule({
    providers: [SteamService, { provide: ConfigService, useValue: { config: steamConfig } }],
  }).compile();
  return moduleRef.get(SteamService);
};

describe("SteamService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns disabled without key or steam id", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SteamService,
        {
          provide: ConfigService,
          useValue: {
            config: { ...steamConfig, steamApiKey: undefined },
          },
        },
      ],
    }).compile();
    const service = moduleRef.get(SteamService);
    await expect(service.getStatus()).resolves.toEqual({ status: "disabled" });
  });

  it("returns ready payload with current game and recently played", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("GetPlayerSummaries")) {
          return {
            ok: true,
            json: async () => ({
              response: {
                players: [
                  {
                    personaname: "example",
                    personastate: 1,
                    gameextrainfo: "Half-Life 2",
                    gameid: "220",
                    avatarfull: "https://avatars.steamstatic.com/example.jpg",
                    profileurl: "https://steamcommunity.com/id/example",
                  },
                ],
              },
            }),
          };
        }
        if (url.includes("GetRecentlyPlayedGames")) {
          return {
            ok: true,
            json: async () => ({
              response: {
                games: [
                  {
                    appid: 220,
                    name: "Portal",
                    playtime_2weeks: 90,
                    img_icon_url: "7e3cb1241e924c0622b55f1638f8f63f6e2e94eb",
                  },
                ],
              },
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const service = await createService();
    const status = await service.getStatus();
    expect(status.status).toBe("ready");
    if (status.status === "ready") {
      expect(status.personaState).toBe("online");
      expect(status.username).toBe("example");
      expect(status.currentGame).toEqual({ name: "Half-Life 2", sessionSec: 0 });
      expect(status.recentlyPlayed).toEqual([
        {
          name: "Portal",
          playtime2WeeksMin: 90,
          iconUrl:
            "https://media.steampowered.com/steamcommunity/public/images/apps/220/7e3cb1241e924c0622b55f1638f8f63f6e2e94eb.jpg",
        },
      ]);
    }
  });

  it("accumulates session playtime across polls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: {
            players: [
              {
                personaname: "example",
                personastate: 1,
                gameextrainfo: "Half-Life 2",
                gameid: "220",
              },
            ],
            games: [],
          },
        }),
      })),
    );

    const service = await createService();
    await service.getStatus(true);

    vi.setSystemTime(new Date("2026-01-01T12:05:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("GetPlayerSummaries")) {
          return {
            ok: true,
            json: async () => ({
              response: {
                players: [
                  {
                    personaname: "example",
                    personastate: 1,
                    gameextrainfo: "Half-Life 2",
                    gameid: "220",
                  },
                ],
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ response: { games: [] } }),
        };
      }),
    );

    const second = await service.getStatus(true);
    expect(second.status).toBe("ready");
    if (second.status === "ready") {
      expect(second.currentGame?.sessionSec).toBe(300);
    }
  });
});
