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
import {
  GOOGLE_CALLBACK_ROUTE,
  GOOGLE_CONNECT_ROUTE,
  GOOGLE_DISCONNECT_ROUTE,
} from "@pryladova/shared";
import type { Request, Response } from "express";
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
import { GoogleTokenService } from "./google-token.service.js";

const parseReconnect = (value: string | undefined): boolean => value === "1" || value === "true";

const readOAuthStateCookie = (request: Request): string | undefined => {
  const raw = request.cookies?.[GOOGLE_OAUTH_STATE_COOKIE];
  return typeof raw === "string" ? raw : undefined;
};

const clearOAuthStateCookie = (response: Response, secure: boolean): void => {
  response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, oauthStateCookieOptions(secure));
};

@Controller()
export class GoogleOauthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly googleTokenService: GoogleTokenService,
    private readonly googleAccountService: GoogleAccountService,
  ) {}

  @Get(GOOGLE_CONNECT_ROUTE)
  connect(
    @Query("reconnect") reconnectRaw: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): void {
    const { sessionSecret, googleClientId, googleRedirectUri, integrationEncryptionKey } =
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
    const secure = process.env.NODE_ENV === "production";
    const cookieValue = encodeOAuthStateCookie(sessionSecret, { state, codeVerifier });
    response.cookie(GOOGLE_OAUTH_STATE_COOKIE, cookieValue, oauthStateCookieOptions(secure));

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
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") googleError: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const { sessionSecret } = this.configService.config;
    const secure = process.env.NODE_ENV === "production";
    const cookieValue = readOAuthStateCookie(request);
    const oauthCookie = decodeOAuthStateCookie(cookieValue, sessionSecret ?? "");
    clearOAuthStateCookie(response, secure);

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

    try {
      const exchanged = await this.googleTokenService.exchangeAuthorizationCode(
        code,
        oauthCookie.codeVerifier,
      );

      if (exchanged.refreshToken) {
        const encrypted = this.googleTokenService.encryptRefreshToken(exchanged.refreshToken);
        const persisted = await this.settingsService.saveGoogleRefreshTokenEncrypted(encrypted);
        if (!persisted) {
          response.redirect("/?google_oauth=persist_failed");
          return;
        }
      } else if (!this.settingsService.hasGoogleRefreshTokenEncrypted()) {
        response.redirect("/?google_oauth=missing_refresh");
        return;
      }

      await this.googleAccountService.fetchAndPersistAccountEmail(
        exchanged.accessToken,
        exchanged.idToken,
      );

      response.redirect("/?google_oauth=connected");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] google oauth callback failed: ${message}`);
      response.redirect("/?google_oauth=exchange_failed");
    }
  }

  @Post(GOOGLE_DISCONNECT_ROUTE)
  @HttpCode(204)
  async disconnect(@Res({ passthrough: true }) response: Response): Promise<void> {
    const cleared = await this.settingsService.clearGoogleRefreshTokenEncrypted();
    if (!cleared) {
      throw new ServiceUnavailableException("Could not clear Google refresh token");
    }
    this.googleTokenService.clearAccessTokenCache();
    this.googleAccountService.clearEnvAccountEmailCache();
    void response;
  }
}
