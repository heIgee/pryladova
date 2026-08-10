import { Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service.js";
import { fetchGoogleAccountEmail, parseGoogleIdTokenEmail } from "./google-account.logic.js";
import { GoogleTokenService } from "./google-token.service.js";

@Injectable()
export class GoogleAccountService {
  private envAccountEmail: string | null = null;

  constructor(
    private readonly googleTokenService: GoogleTokenService,
    private readonly settingsService: SettingsService,
  ) {}

  getStoredAccountEmail(): string | null {
    return this.settingsService.getGoogleAccountEmail();
  }

  async resolveAccountEmail(accessToken: string): Promise<string | null> {
    const stored = this.settingsService.getGoogleAccountEmail();
    if (stored) {
      return stored;
    }

    if (this.googleTokenService.hasEnvRefreshTokenOverride()) {
      if (this.envAccountEmail) {
        return this.envAccountEmail;
      }
    }

    try {
      const email = await fetchGoogleAccountEmail(accessToken);
      if (!email) {
        return null;
      }

      if (this.googleTokenService.hasEnvRefreshTokenOverride()) {
        this.envAccountEmail = email;
        return email;
      }

      await this.settingsService.saveGoogleAccountEmail(email);
      return email;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] google account email fetch failed: ${message}`);
      return null;
    }
  }

  async fetchAndPersistAccountEmail(
    accessToken: string,
    idToken?: string | null,
  ): Promise<string | null> {
    const fromIdToken = parseGoogleIdTokenEmail(idToken ?? undefined);
    if (fromIdToken) {
      if (this.googleTokenService.hasEnvRefreshTokenOverride()) {
        this.envAccountEmail = fromIdToken;
        return fromIdToken;
      }
      await this.settingsService.saveGoogleAccountEmail(fromIdToken);
      return fromIdToken;
    }

    try {
      const email = await fetchGoogleAccountEmail(accessToken);
      if (!email) {
        return null;
      }

      if (this.googleTokenService.hasEnvRefreshTokenOverride()) {
        this.envAccountEmail = email;
        return email;
      }

      await this.settingsService.saveGoogleAccountEmail(email);
      return email;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] google account email persist failed: ${message}`);
      return null;
    }
  }

  clearEnvAccountEmailCache(): void {
    this.envAccountEmail = null;
  }
}
