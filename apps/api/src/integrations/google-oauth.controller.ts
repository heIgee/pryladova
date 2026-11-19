import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  GOOGLE_CALLBACK_ROUTE,
  GOOGLE_CONNECT_ROUTE,
  GOOGLE_DISCONNECT_ROUTE,
} from "@pryladova/shared";
import { Public } from "../auth/public.decorator.js";
import { ConfigService } from "../config.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import {
  buildGoogleAuthUrl,
  createOAuthStateToken,
  decodeOAuthStateCookie,
  encodeOAuthStateCookie,
  GOOGLE_OAUTH_STATE_COOKIE,
  generatePkcePair,
  oauthStateCookieOptions,
  verifyOAuthStateToken,
} from "./google-oauth.logic.js";
import { GoogleOauthCallbackService } from "./google-oauth-callback.service.js";
import { GoogleTokenService } from "./google-token.service.js";

const parseReconnect = (value: string | undefined): boolean => value === "1" || value === "true";

type OAuthStateCookieOptions = ReturnType<typeof oauthStateCookieOptions>;

export type OAuthHttpResponse = {
  cookie(name: string, value: string, options: OAuthStateCookieOptions): void;
  clearCookie(name: string, options: OAuthStateCookieOptions): void;
  redirect(url: string): void;
  status(code: number): { send(body: string): void };
};

export type OAuthHttpRequest = {
  cookies?: Partial<Record<string, string>>;
};

const readOAuthStateCookie = (request: OAuthHttpRequest): string | undefined => {
  const raw = request.cookies?.[GOOGLE_OAUTH_STATE_COOKIE];
  return typeof raw === "string" ? raw : undefined;
};

const clearOAuthStateCookie = (response: OAuthHttpResponse, secure: boolean): void => {
  response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, oauthStateCookieOptions(secure));
};

@Controller()
export class GoogleOauthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly googleTokenService: GoogleTokenService,
    private readonly googleOauthCallbackService: GoogleOauthCallbackService,
    private readonly googleAccountService: GoogleAccountService,
  ) {}

  @Post(GOOGLE_CONNECT_ROUTE)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  connect(
    @Query("reconnect") reconnectRaw: string | undefined,
    @Res({ passthrough: true }) response: OAuthHttpResponse,
  ): void {
    const { sessionSecret, googleClientId, googleRedirectUri, integrationEncryptionKey, runtime } =
      this.configService.config;

    if (!sessionSecret) {
      throw new ServiceUnavailableException("Panel auth is not configured");
    }

    if (!this.googleTokenService.isGoogleClientConfigured()) {
      throw new ServiceUnavailableException("Google OAuth client is not configured");
    }

    if (!this.settingsService.canPersistGoogleOAuth() || !integrationEncryptionKey) {
      throw new ServiceUnavailableException(
        "Google OAuth connect requires Supabase and INTEGRATION_ENCRYPTION_KEY",
      );
    }

    if (!googleClientId || !googleRedirectUri) {
      throw new ServiceUnavailableException("Google OAuth client is not configured");
    }

    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = createOAuthStateToken(sessionSecret);
    const cookieValue = encodeOAuthStateCookie(sessionSecret, { state, codeVerifier });
    response.cookie(
      GOOGLE_OAUTH_STATE_COOKIE,
      cookieValue,
      oauthStateCookieOptions(runtime.isProduction),
    );

    const promptConsent =
      parseReconnect(reconnectRaw) ||
      !this.settingsService.hasGoogleRefreshTokenEncrypted() ||
      !this.settingsService.getGoogleAccountEmail();
    const authUrl = buildGoogleAuthUrl({
      clientId: googleClientId,
      redirectUri: googleRedirectUri,
      state,
      codeChallenge,
      promptConsent,
    });

    response.redirect(authUrl);
  }

  @Public()
  @Get(GOOGLE_CALLBACK_ROUTE)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") googleError: string | undefined,
    @Req() request: OAuthHttpRequest,
    @Res({ passthrough: true }) response: OAuthHttpResponse,
  ): Promise<void> {
    const { sessionSecret, runtime } = this.configService.config;
    const cookieValue = readOAuthStateCookie(request);
    const oauthCookie = decodeOAuthStateCookie(cookieValue, sessionSecret ?? "");
    clearOAuthStateCookie(response, runtime.isProduction);

    if (!sessionSecret || !oauthCookie || !state || !verifyOAuthStateToken(state, sessionSecret)) {
      response.status(400).send("Invalid OAuth state");
      return;
    }

    if (oauthCookie.state !== state) {
      response.status(400).send("OAuth state mismatch");
      return;
    }

    if (googleError) {
      response.redirect("/?google_oauth=denied");
      return;
    }

    if (!code) {
      response.redirect("/?google_oauth=missing_code");
      return;
    }

    const redirectPath = await this.googleOauthCallbackService.finishAuthorization(
      code,
      oauthCookie.codeVerifier,
    );
    response.redirect(redirectPath);
  }

  @Post(GOOGLE_DISCONNECT_ROUTE)
  @HttpCode(204)
  async disconnect(@Res({ passthrough: true }) response: OAuthHttpResponse): Promise<void> {
    const cleared = await this.settingsService.clearGoogleRefreshTokenEncrypted();
    if (!cleared) {
      throw new ServiceUnavailableException("Could not clear Google refresh token");
    }
    this.googleTokenService.clearAccessTokenCache();
    this.googleAccountService.clearEnvAccountEmailCache();
    void response;
  }
}
