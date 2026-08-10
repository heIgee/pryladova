import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../config.js";
import { ConfigService } from "../config.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import { GoogleTasksService } from "./google-tasks.service.js";
import { GoogleTokenService } from "./google-token.service.js";

const googleConfig: ApiConfig = {
  geminiApiKey: undefined,
  geminiModel: "gemini-3.1-flash-lite",
  ingestSecret: undefined,
  sentryDsn: undefined,
  sessionSecret: "test-session-secret-at-least-32-characters",
  panelPasswordHash: undefined,
  supabaseUrl: undefined,
  supabaseSecretKey: undefined,
  githubToken: undefined,
  githubUsername: undefined,
  steamApiKey: undefined,
  steamId: undefined,
  googleClientId: "google-client-id",
  googleClientSecret: "google-client-secret",
  googleRedirectUri: "http://localhost:5173/api/integrations/google/callback",
  googleRefreshToken: "env-refresh-token",
  integrationEncryptionKey: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
};

describe("GoogleTasksService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns disabled without google client config", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleTasksService,
        GoogleTokenService,
        {
          provide: ConfigService,
          useValue: { config: { ...googleConfig, googleClientId: undefined } },
        },
        {
          provide: SettingsService,
          useValue: {
            hasGoogleRefreshTokenEncrypted: vi.fn(() => false),
            getGoogleRefreshTokenEncrypted: vi.fn(() => null),
          },
        },
        {
          provide: GoogleAccountService,
          useValue: { resolveAccountEmail: vi.fn(async () => null) },
        },
      ],
    }).compile();
    const service = moduleRef.get(GoogleTasksService);
    await expect(service.getStatus()).resolves.toEqual({ status: "disabled" });
  });

  it("returns ready payload from Google Tasks API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("tasks.googleapis.com/tasks/v1/lists")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  title: "Write docs",
                  status: "needsAction",
                  due: "2026-08-10T00:00:00.000Z",
                },
              ],
            }),
          };
        }
        if (url.includes("oauth2.googleapis.com/token")) {
          return {
            ok: true,
            json: async () => ({ access_token: "access-token", expires_in: 3600 }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleTasksService,
        GoogleTokenService,
        { provide: ConfigService, useValue: { config: googleConfig } },
        {
          provide: SettingsService,
          useValue: {
            hasGoogleRefreshTokenEncrypted: vi.fn(() => false),
            getGoogleRefreshTokenEncrypted: vi.fn(() => null),
            clearGoogleRefreshTokenEncrypted: vi.fn(async () => true),
          },
        },
        {
          provide: GoogleAccountService,
          useValue: { resolveAccountEmail: vi.fn(async () => "user@example.com") },
        },
      ],
    }).compile();
    const service = moduleRef.get(GoogleTasksService);

    const status = await service.getStatus(true);
    expect(status.status).toBe("ready");
    if (status.status === "ready") {
      expect(status.accountEmail).toBe("user@example.com");
      expect(status.openCount).toBe(1);
      expect(status.dueTodayCount).toBe(1);
      expect(status.tasks[0]?.title).toBe("Write docs");
    }

    vi.useRealTimers();
  });
});
