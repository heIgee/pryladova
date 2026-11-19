import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiConfig, testApiConfig } from "../config.js";
import { ConfigService } from "../config.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import {
  GoogleOauthController,
  type OAuthHttpRequest,
  type OAuthHttpResponse,
} from "./google-oauth.controller.js";
import {
  createOAuthStateToken,
  decodeOAuthStateCookie,
  encodeOAuthStateCookie,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "./google-oauth.logic.js";
import { GoogleOauthCallbackService } from "./google-oauth-callback.service.js";
import { GoogleTokenService } from "./google-token.service.js";

const SECRET = "test-session-secret-0123456789abcdef";

const baseConfig = testApiConfig({
  sessionSecret: SECRET,
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  googleRedirectUri: "https://hub.example/api/integrations/google/callback",
  integrationEncryptionKey: "key",
});

type ResponseRecorder = {
  cookies: Record<string, string>;
  cleared: string[];
  redirects: string[];
  statusCode: number | null;
  body: string | null;
};

const createResponse = (): { response: OAuthHttpResponse; recorded: ResponseRecorder } => {
  const recorded: ResponseRecorder = {
    cookies: {},
    cleared: [],
    redirects: [],
    statusCode: null,
    body: null,
  };
  const response: OAuthHttpResponse = {
    cookie: (name: string, value: string) => {
      recorded.cookies[name] = value;
    },
    clearCookie: (name: string) => {
      recorded.cleared.push(name);
    },
    redirect: (url: string) => {
      recorded.redirects.push(url);
    },
    status(code: number) {
      recorded.statusCode = code;
      return {
        send: (body: string) => {
          recorded.body = body;
        },
      };
    },
  };
  return { response, recorded };
};

const requestWithCookie = (value: string | undefined): OAuthHttpRequest => ({
  cookies: value ? { [GOOGLE_OAUTH_STATE_COOKIE]: value } : {},
});

const createController = async (overrides?: {
  config?: Partial<ApiConfig>;
  settings?: Partial<Record<keyof SettingsService, unknown>>;
  token?: Partial<Record<keyof GoogleTokenService, unknown>>;
}) => {
  const settings = {
    canPersistGoogleOAuth: vi.fn(() => true),
    hasGoogleRefreshTokenEncrypted: vi.fn(() => true),
    getGoogleAccountEmail: vi.fn(() => "me@example.com"),
    saveGoogleRefreshTokenEncrypted: vi.fn(async () => true),
    clearGoogleRefreshTokenEncrypted: vi.fn(async () => true),
    ...overrides?.settings,
  };
  const token = {
    isGoogleClientConfigured: vi.fn(() => true),
    exchangeAuthorizationCode: vi.fn(async () => ({
      accessToken: "access",
      refreshToken: "refresh",
      idToken: undefined,
    })),
    encryptRefreshToken: vi.fn((value: string) => `enc:${value}`),
    clearAccessTokenCache: vi.fn(),
    ...overrides?.token,
  };
  const account = {
    fetchAndPersistAccountEmail: vi.fn(async () => undefined),
    clearEnvAccountEmailCache: vi.fn(),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [GoogleOauthController],
    providers: [
      {
        provide: ConfigService,
        useValue: { config: { ...baseConfig, ...overrides?.config } },
      },
      { provide: SettingsService, useValue: settings },
      { provide: GoogleTokenService, useValue: token },
      { provide: GoogleAccountService, useValue: account },
      GoogleOauthCallbackService,
    ],
  }).compile();

  return { controller: moduleRef.get(GoogleOauthController), settings, token, account };
};

const validCallbackRequest = (): { state: string; request: OAuthHttpRequest } => {
  const state = createOAuthStateToken(SECRET);
  const cookie = encodeOAuthStateCookie(SECRET, { state, codeVerifier: "verifier" });
  return { state, request: requestWithCookie(cookie) };
};

describe("GoogleOauthController.connect", () => {
  it("sets a signed PKCE state cookie and redirects to Google", async () => {
    const { controller } = await createController();
    const { response, recorded } = createResponse();

    controller.connect(undefined, response);

    const cookie = decodeOAuthStateCookie(recorded.cookies[GOOGLE_OAUTH_STATE_COOKIE], SECRET);
    expect(cookie?.codeVerifier).toBeTruthy();
    const url = new URL(recorded.redirects[0] ?? "");
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("state")).toBe(cookie?.state);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("forces consent when no refresh token is stored", async () => {
    const forced = await createController({
      settings: { hasGoogleRefreshTokenEncrypted: vi.fn(() => false) },
    });
    const quiet = await createController();
    const forcedResponse = createResponse();
    const quietResponse = createResponse();

    forced.controller.connect(undefined, forcedResponse.response);
    quiet.controller.connect(undefined, quietResponse.response);

    expect(new URL(forcedResponse.recorded.redirects[0] ?? "").searchParams.get("prompt")).toBe(
      "consent",
    );
    expect(new URL(quietResponse.recorded.redirects[0] ?? "").searchParams.get("prompt")).not.toBe(
      "consent",
    );
  });

  it.each([
    ["panel auth", { config: { sessionSecret: undefined } }],
    ["client", { token: { isGoogleClientConfigured: vi.fn(() => false) } }],
    ["persistence", { settings: { canPersistGoogleOAuth: vi.fn(() => false) } }],
    ["encryption key", { config: { integrationEncryptionKey: undefined } }],
    ["redirect uri", { config: { googleRedirectUri: undefined } }],
  ])("refuses to start without %s", async (_label, overrides) => {
    const { controller } = await createController(overrides);
    const { response, recorded } = createResponse();

    expect(() => controller.connect(undefined, response)).toThrow(ServiceUnavailableException);
    expect(recorded.redirects).toEqual([]);
  });
});

describe("GoogleOauthController.callback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing or forged state cookie", async () => {
    const { controller, token } = await createController();
    const state = createOAuthStateToken(SECRET);

    for (const request of [requestWithCookie(undefined), requestWithCookie("forged.cookie")]) {
      const { response, recorded } = createResponse();
      // biome-ignore lint/performance/noAwaitInLoops: each cookie is a separate response assertion
      await controller.callback("code", state, undefined, request, response);
      expect(recorded.statusCode).toBe(400);
      expect(recorded.cleared).toContain(GOOGLE_OAUTH_STATE_COOKIE);
    }
    expect(token.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects a state that does not match the cookie", async () => {
    const { controller, token } = await createController();
    const { request } = validCallbackRequest();
    const otherState = createOAuthStateToken(SECRET);
    const { response, recorded } = createResponse();

    await controller.callback("code", otherState, undefined, request, response);

    expect(recorded.statusCode).toBe(400);
    expect(recorded.body).toBe("OAuth state mismatch");
    expect(token.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("redirects when Google denies consent or omits the code", async () => {
    const { controller } = await createController();

    const denied = validCallbackRequest();
    const deniedResponse = createResponse();
    await controller.callback(
      undefined,
      denied.state,
      "access_denied",
      denied.request,
      deniedResponse.response,
    );
    expect(deniedResponse.recorded.redirects).toEqual(["/?google_oauth=denied"]);

    const missing = validCallbackRequest();
    const missingResponse = createResponse();
    await controller.callback(
      undefined,
      missing.state,
      undefined,
      missing.request,
      missingResponse.response,
    );
    expect(missingResponse.recorded.redirects).toEqual(["/?google_oauth=missing_code"]);
  });

  it("exchanges the code with the cookie verifier and stores the encrypted token", async () => {
    const { controller, settings, token, account } = await createController();
    const { state, request } = validCallbackRequest();
    const { response, recorded } = createResponse();

    await controller.callback("auth-code", state, undefined, request, response);

    expect(token.exchangeAuthorizationCode).toHaveBeenCalledWith("auth-code", "verifier");
    expect(settings.saveGoogleRefreshTokenEncrypted).toHaveBeenCalledWith("enc:refresh");
    expect(account.fetchAndPersistAccountEmail).toHaveBeenCalledWith("access", undefined);
    expect(recorded.redirects).toEqual(["/?google_oauth=connected"]);
  });

  it("reports persist failures", async () => {
    const { controller } = await createController({
      settings: { saveGoogleRefreshTokenEncrypted: vi.fn(async () => false) },
    });
    const { state, request } = validCallbackRequest();
    const { response, recorded } = createResponse();

    await controller.callback("auth-code", state, undefined, request, response);

    expect(recorded.redirects).toEqual(["/?google_oauth=persist_failed"]);
  });

  it("requires a refresh token when none is stored yet", async () => {
    const { controller } = await createController({
      settings: { hasGoogleRefreshTokenEncrypted: vi.fn(() => false) },
      token: {
        exchangeAuthorizationCode: vi.fn(async () => ({
          accessToken: "access",
          idToken: undefined,
        })),
      },
    });
    const { state, request } = validCallbackRequest();
    const { response, recorded } = createResponse();

    await controller.callback("auth-code", state, undefined, request, response);

    expect(recorded.redirects).toEqual(["/?google_oauth=missing_refresh"]);
  });

  it("reports exchange failures", async () => {
    const { controller } = await createController({
      token: {
        exchangeAuthorizationCode: vi.fn(async () => {
          throw new Error("invalid_grant");
        }),
      },
    });
    const { state, request } = validCallbackRequest();
    const { response, recorded } = createResponse();

    await controller.callback("auth-code", state, undefined, request, response);

    expect(recorded.redirects).toEqual(["/?google_oauth=exchange_failed"]);
  });
});

describe("GoogleOauthController.disconnect", () => {
  it("clears the stored token and caches", async () => {
    const { controller, token, account } = await createController();
    const { response } = createResponse();

    await controller.disconnect(response);

    expect(token.clearAccessTokenCache).toHaveBeenCalled();
    expect(account.clearEnvAccountEmailCache).toHaveBeenCalled();
  });

  it("fails when the token cannot be cleared", async () => {
    const { controller, token } = await createController({
      settings: { clearGoogleRefreshTokenEncrypted: vi.fn(async () => false) },
    });
    const { response } = createResponse();

    await expect(controller.disconnect(response)).rejects.toThrow(ServiceUnavailableException);
    expect(token.clearAccessTokenCache).not.toHaveBeenCalled();
  });
});
