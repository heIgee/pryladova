import { Injectable } from "@nestjs/common";
import { ConfigService } from "../config.service.js";
import {
  isInvalidGrantError,
  parseGoogleTokenError,
  parseGoogleTokenResponse,
} from "./google-oauth.logic.js";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  parseIntegrationEncryptionKey,
} from "./integration-encryption.logic.js";

export type GoogleRefreshTokenSource = "env" | "db";

export class GoogleTokenRefreshError extends Error {
  constructor(
    message: string,
    readonly invalidGrant: boolean,
    readonly source: GoogleRefreshTokenSource,
  ) {
    super(message);
    this.name = "GoogleTokenRefreshError";
  }
}

@Injectable()
export class GoogleTokenService {
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  isGoogleClientConfigured(): boolean {
    const { googleClientId, googleClientSecret, googleRedirectUri } = this.configService.config;
    return Boolean(googleClientId && googleClientSecret && googleRedirectUri);
  }

  hasEnvRefreshTokenOverride(): boolean {
    return Boolean(this.configService.config.googleRefreshToken);
  }

  getRefreshTokenSource(hasDbToken: boolean): GoogleRefreshTokenSource | null {
    if (this.hasEnvRefreshTokenOverride()) {
      return "env";
    }
    if (hasDbToken) {
      return "db";
    }
    return null;
  }

  resolveRefreshToken(
    _hasDbToken: boolean,
    dbTokenPlaintext: string | null,
  ): { token: string; source: GoogleRefreshTokenSource } | null {
    const envToken = this.configService.config.googleRefreshToken;
    if (envToken) {
      return { token: envToken, source: "env" };
    }
    if (dbTokenPlaintext) {
      return { token: dbTokenPlaintext, source: "db" };
    }
    return null;
  }

  async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    refreshToken: string | null;
    idToken: string | null;
  }> {
    const { googleClientId, googleClientSecret, googleRedirectUri } = this.configService.config;
    if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
      throw new Error("Google OAuth client is not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: googleRedirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    const json: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof json === "object" && json !== null && "error" in json
          ? String((json as { error: unknown }).error)
          : `HTTP ${response.status}`;
      throw new Error(`Google token exchange failed: ${message}`);
    }

    const parsed = parseGoogleTokenResponse(json);
    this.setAccessTokenCache(parsed.access_token, parsed.expires_in);
    return {
      accessToken: parsed.access_token,
      expiresIn: parsed.expires_in,
      refreshToken: parsed.refresh_token ?? null,
      idToken: parsed.id_token ?? null,
    };
  }

  async getAccessToken(
    hasDbToken: boolean,
    dbTokenPlaintext: string | null,
  ): Promise<{ accessToken: string; source: GoogleRefreshTokenSource }> {
    const resolved = this.resolveRefreshToken(hasDbToken, dbTokenPlaintext);
    if (!resolved) {
      throw new Error("Google refresh token is not configured");
    }

    const now = Date.now();
    if (this.accessTokenCache !== null && now < this.accessTokenCache.expiresAt - 60_000) {
      return { accessToken: this.accessTokenCache.token, source: resolved.source };
    }

    const { googleClientId, googleClientSecret } = this.configService.config;
    if (!googleClientId || !googleClientSecret) {
      throw new Error("Google OAuth client is not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: resolved.token,
        grant_type: "refresh_token",
      }),
    });

    const json: unknown = await response.json();
    if (!response.ok) {
      const tokenError = parseGoogleTokenError(json);
      if (response.status === 400 && isInvalidGrantError(tokenError)) {
        throw new GoogleTokenRefreshError("Google refresh token rejected", true, resolved.source);
      }
      const message = tokenError?.error ?? `HTTP ${response.status}`;
      throw new GoogleTokenRefreshError(
        `Google token refresh failed: ${message}`,
        false,
        resolved.source,
      );
    }

    const parsed = parseGoogleTokenResponse(json);
    this.setAccessTokenCache(parsed.access_token, parsed.expires_in);
    return { accessToken: parsed.access_token, source: resolved.source };
  }

  encryptRefreshToken(plaintext: string): string {
    const keyRaw = this.configService.config.integrationEncryptionKey;
    if (!keyRaw) {
      throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
    }
    const key = parseIntegrationEncryptionKey(keyRaw);
    return encryptIntegrationSecret(plaintext, key);
  }

  decryptRefreshToken(ciphertext: string): string {
    const keyRaw = this.configService.config.integrationEncryptionKey;
    if (!keyRaw) {
      throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
    }
    const key = parseIntegrationEncryptionKey(keyRaw);
    return decryptIntegrationSecret(ciphertext, key);
  }

  clearAccessTokenCache(): void {
    this.accessTokenCache = null;
  }

  private setAccessTokenCache(accessToken: string, expiresIn: number): void {
    this.accessTokenCache = {
      token: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }
}
