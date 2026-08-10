import { Injectable } from "@nestjs/common";
import { type GoogleTasksStatusResponse, parseGoogleTasksStatusResponse } from "@pryladova/shared";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import { googleTasksSchema, summarizeTasks } from "./google-tasks.logic.js";
import { GoogleTokenRefreshError, GoogleTokenService } from "./google-token.service.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TASK_LIST_ID = "@default";

type CachedReady = Extract<GoogleTasksStatusResponse, { status: "ready" }>;

@Injectable()
export class GoogleTasksService {
  private cached: { ready: CachedReady; expiresAt: number } | null = null;

  constructor(
    private readonly googleTokenService: GoogleTokenService,
    private readonly settingsService: SettingsService,
    private readonly googleAccountService: GoogleAccountService,
  ) {}

  async getStatus(refresh = false): Promise<GoogleTasksStatusResponse> {
    if (!this.googleTokenService.isGoogleClientConfigured()) {
      return parseGoogleTasksStatusResponse({ status: "disabled" });
    }

    const hasDbToken = this.settingsService.hasGoogleRefreshTokenEncrypted();
    const dbTokenPlaintext = this.getDbRefreshTokenPlaintext();
    const resolved = this.googleTokenService.resolveRefreshToken(hasDbToken, dbTokenPlaintext);

    if (!resolved) {
      return parseGoogleTasksStatusResponse({ status: "needs_auth" });
    }

    const now = Date.now();
    if (!refresh && this.cached !== null && now < this.cached.expiresAt) {
      return this.cached.ready;
    }

    try {
      const ready = await this.fetchStatus(hasDbToken, dbTokenPlaintext);
      this.cached = { ready, expiresAt: now + CACHE_TTL_MS };
      return ready;
    } catch (error: unknown) {
      if (error instanceof GoogleTokenRefreshError) {
        if (error.invalidGrant) {
          if (error.source === "env") {
            if (this.cached !== null) {
              return this.cached.ready;
            }
            return parseGoogleTasksStatusResponse({ status: "misconfigured" });
          }
          await this.settingsService.clearGoogleRefreshTokenEncrypted();
          this.googleTokenService.clearAccessTokenCache();
          return parseGoogleTasksStatusResponse({ status: "needs_auth" });
        }
      }

      if (this.cached !== null) {
        return this.cached.ready;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] google tasks fetch failed: ${message}`);
      return parseGoogleTasksStatusResponse({ status: "unavailable" });
    }
  }

  private async fetchStatus(
    hasDbToken: boolean,
    dbTokenPlaintext: string | null,
  ): Promise<CachedReady> {
    const { accessToken } = await this.googleTokenService.getAccessToken(
      hasDbToken,
      dbTokenPlaintext,
    );
    const accountEmail = await this.googleAccountService.resolveAccountEmail(accessToken);
    const now = new Date();
    const nowIso = now.toISOString();

    const response = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(DEFAULT_TASK_LIST_ID)}/tasks?${new URLSearchParams(
        {
          showCompleted: "false",
          showHidden: "false",
          maxResults: "20",
        },
      )}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Google Tasks HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    const parsed = googleTasksSchema.parse(json);
    const summary = summarizeTasks(parsed.items ?? [], now);

    return parseGoogleTasksStatusResponse({
      status: "ready",
      accountEmail,
      openCount: summary.openCount,
      dueTodayCount: summary.dueTodayCount,
      tasks: summary.tasks,
      fetchedAt: nowIso,
    }) as CachedReady;
  }

  private getDbRefreshTokenPlaintext(): string | null {
    const encrypted = this.settingsService.getGoogleRefreshTokenEncrypted();
    if (!encrypted) {
      return null;
    }

    try {
      return this.googleTokenService.decryptRefreshToken(encrypted);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] google refresh token decrypt failed: ${message}`);
      return null;
    }
  }
}
