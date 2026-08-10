import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../config.js";
import { ConfigService } from "../config.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import { GoogleCalendarService } from "./google-calendar.service.js";
import { GoogleTokenRefreshError, GoogleTokenService } from "./google-token.service.js";

const encryptionKey = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

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
  integrationEncryptionKey: encryptionKey,
};

const createService = async (
  config: ApiConfig = googleConfig,
  settings: Partial<SettingsService> = {},
): Promise<GoogleCalendarService> => {
  const settingsService = {
    hasGoogleRefreshTokenEncrypted: vi.fn(() => false),
    getGoogleRefreshTokenEncrypted: vi.fn(() => null),
    getGoogleAccountEmail: vi.fn(() => null),
    clearGoogleRefreshTokenEncrypted: vi.fn(async () => true),
    ...settings,
  };

  const googleAccountService = {
    resolveAccountEmail: vi.fn(async () => "user@example.com"),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      GoogleCalendarService,
      GoogleTokenService,
      { provide: ConfigService, useValue: { config } },
      { provide: SettingsService, useValue: settingsService },
      { provide: GoogleAccountService, useValue: googleAccountService },
    ],
  }).compile();

  return moduleRef.get(GoogleCalendarService);
};

describe("GoogleCalendarService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns disabled without google client config", async () => {
    const service = await createService({
      ...googleConfig,
      googleClientId: undefined,
    });
    await expect(service.getStatus()).resolves.toEqual({ status: "disabled" });
  });

  it("returns needs_auth without refresh token", async () => {
    const service = await createService({
      ...googleConfig,
      googleRefreshToken: undefined,
    });
    await expect(service.getStatus()).resolves.toEqual({ status: "needs_auth" });
  });

  it("returns ready payload from Google Calendar API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendars/primary/events")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  summary: "Focus block",
                  start: { dateTime: "2026-08-10T14:00:00.000Z", timeZone: "UTC" },
                  end: { dateTime: "2026-08-10T15:00:00.000Z", timeZone: "UTC" },
                },
              ],
            }),
          };
        }
        if (url.includes("oauth2.googleapis.com/token")) {
          return {
            ok: true,
            json: async () => ({
              access_token: "access-token",
              expires_in: 3600,
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));

    const service = await createService();
    const status = await service.getStatus(true);
    expect(status.status).toBe("ready");
    if (status.status === "ready") {
      expect(status.inMeeting).toBe(false);
      expect(status.accountEmail).toBe("user@example.com");
      expect(status.upcomingEvents[0]?.title).toBe("Focus block");
    }
  });

  it("returns misconfigured when env refresh token is invalid_grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      })),
    );

    const settingsService = {
      hasGoogleRefreshTokenEncrypted: vi.fn(() => true),
      getGoogleRefreshTokenEncrypted: vi.fn(() => "encrypted"),
      clearGoogleRefreshTokenEncrypted: vi.fn(async () => true),
    };

    const googleAccountService = {
      resolveAccountEmail: vi.fn(async () => null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        GoogleTokenService,
        { provide: ConfigService, useValue: { config: googleConfig } },
        { provide: SettingsService, useValue: settingsService },
        { provide: GoogleAccountService, useValue: googleAccountService },
      ],
    }).compile();

    const tokenService = moduleRef.get(GoogleTokenService);
    vi.spyOn(tokenService, "decryptRefreshToken").mockReturnValue("db-token");

    const service = moduleRef.get(GoogleCalendarService);
    await expect(service.getStatus(true)).resolves.toEqual({ status: "misconfigured" });
    expect(settingsService.clearGoogleRefreshTokenEncrypted).not.toHaveBeenCalled();
  });

  it("clears db token and returns needs_auth on invalid_grant for db source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      })),
    );

    const clearMock = vi.fn(async () => true);
    const settingsService = {
      hasGoogleRefreshTokenEncrypted: vi.fn(() => true),
      getGoogleRefreshTokenEncrypted: vi.fn(() => "v1:abc:def:ghi"),
      clearGoogleRefreshTokenEncrypted: clearMock,
    };

    const googleAccountService = {
      resolveAccountEmail: vi.fn(async () => null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        GoogleTokenService,
        {
          provide: ConfigService,
          useValue: { config: { ...googleConfig, googleRefreshToken: undefined } },
        },
        { provide: SettingsService, useValue: settingsService },
        { provide: GoogleAccountService, useValue: googleAccountService },
      ],
    }).compile();

    const tokenService = moduleRef.get(GoogleTokenService);
    vi.spyOn(tokenService, "decryptRefreshToken").mockReturnValue("db-token");
    const service = moduleRef.get(GoogleCalendarService);

    await expect(service.getStatus(true)).resolves.toEqual({ status: "needs_auth" });
    expect(clearMock).toHaveBeenCalled();
  });

  it("returns unavailable on refresh network errors without clearing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "server_error" }),
      })),
    );

    const clearMock = vi.fn(async () => true);
    const service = await createService(googleConfig, {
      clearGoogleRefreshTokenEncrypted: clearMock,
    });

    await expect(service.getStatus(true)).resolves.toEqual({ status: "unavailable" });
    expect(clearMock).not.toHaveBeenCalled();
  });
});

describe("GoogleTokenRefreshError", () => {
  it("carries invalid grant metadata", () => {
    const error = new GoogleTokenRefreshError("failed", true, "env");
    expect(error.invalidGrant).toBe(true);
    expect(error.source).toBe("env");
  });
});
