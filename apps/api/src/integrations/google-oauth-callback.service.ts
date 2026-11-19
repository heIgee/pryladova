import { Injectable, Logger } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import { GoogleTokenService } from "./google-token.service.js";

export type GoogleOauthCallbackRedirect =
  | "/?google_oauth=connected"
  | "/?google_oauth=persist_failed"
  | "/?google_oauth=missing_refresh"
  | "/?google_oauth=exchange_failed";

@Injectable()
export class GoogleOauthCallbackService {
  private readonly logger = new Logger(GoogleOauthCallbackService.name);

  constructor(
    private readonly googleTokenService: GoogleTokenService,
    private readonly googleAccountService: GoogleAccountService,
    private readonly settingsService: SettingsService,
  ) {}

  async finishAuthorization(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleOauthCallbackRedirect> {
    try {
      const exchanged = await this.googleTokenService.exchangeAuthorizationCode(code, codeVerifier);

      if (exchanged.refreshToken) {
        const encrypted = this.googleTokenService.encryptRefreshToken(exchanged.refreshToken);
        const persisted = await this.settingsService.saveGoogleRefreshTokenEncrypted(encrypted);
        if (!persisted) {
          return "/?google_oauth=persist_failed";
        }
      } else if (!this.settingsService.hasGoogleRefreshTokenEncrypted()) {
        return "/?google_oauth=missing_refresh";
      }

      await this.googleAccountService.fetchAndPersistAccountEmail(
        exchanged.accessToken,
        exchanged.idToken,
      );

      return "/?google_oauth=connected";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`google oauth callback failed: ${message}`);
      return "/?google_oauth=exchange_failed";
    }
  }
}
