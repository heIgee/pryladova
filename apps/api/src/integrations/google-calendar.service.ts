import { Injectable, Logger } from "@nestjs/common";
import {
  type GoogleCalendarStatusResponse,
  parseGoogleCalendarStatusResponse,
} from "@pryladova/shared";
import { SettingsService } from "../settings/settings.service.js";
import { GoogleAccountService } from "./google-account.service.js";
import {
  calendarFetchTimeMaxIso,
  googleCalendarEventsSchema,
  inferAccountEmailFromCalendarEvents,
  isActiveTimedMeeting,
  pickCurrentEvent,
  pickUpcomingEvents,
} from "./google-calendar.logic.js";
import { GoogleTokenRefreshError, GoogleTokenService } from "./google-token.service.js";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedReady = Extract<GoogleCalendarStatusResponse, { status: "ready" }>;

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private cached: { ready: CachedReady; expiresAt: number } | null = null;

  constructor(
    private readonly googleTokenService: GoogleTokenService,
    private readonly settingsService: SettingsService,
    private readonly googleAccountService: GoogleAccountService,
  ) {}

  async getStatus(refresh = false): Promise<GoogleCalendarStatusResponse> {
    if (!this.googleTokenService.isGoogleClientConfigured()) {
      return parseGoogleCalendarStatusResponse({ status: "disabled" });
    }

    const hasDbToken = this.settingsService.hasGoogleRefreshTokenEncrypted();
    const dbTokenPlaintext = this.getDbRefreshTokenPlaintext();
    const resolved = this.googleTokenService.resolveRefreshToken(hasDbToken, dbTokenPlaintext);

    if (!resolved) {
      return parseGoogleCalendarStatusResponse({ status: "needs_auth" });
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
            return parseGoogleCalendarStatusResponse({ status: "misconfigured" });
          }
          await this.settingsService.clearGoogleRefreshTokenEncrypted();
          this.googleTokenService.clearAccessTokenCache();
          return parseGoogleCalendarStatusResponse({ status: "needs_auth" });
        }
      }

      if (this.cached !== null) {
        return this.cached.ready;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`google calendar fetch failed: ${message}`);
      return parseGoogleCalendarStatusResponse({ status: "unavailable" });
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
    const now = new Date();
    const nowIso = now.toISOString();
    const timeMax = calendarFetchTimeMaxIso(now);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
        timeMin: nowIso,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "25",
      })}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Google Calendar events HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    const parsed = googleCalendarEventsSchema.parse(json);
    const events = parsed.items ?? [];

    let accountEmail = await this.googleAccountService.resolveAccountEmail(accessToken);
    if (!accountEmail) {
      accountEmail = inferAccountEmailFromCalendarEvents(events);
      if (accountEmail) {
        await this.settingsService.saveGoogleAccountEmail(accountEmail);
      }
    }

    const nowMs = now.getTime();
    const currentEvent = pickCurrentEvent(events, nowMs);
    const upcomingEvents = pickUpcomingEvents(events, nowMs);
    const activeTimed = events.some((event) => isActiveTimedMeeting(event, nowMs));

    const readyResponse = parseGoogleCalendarStatusResponse({
      status: "ready",
      accountEmail,
      inMeeting: activeTimed,
      currentEvent,
      upcomingEvents,
      fetchedAt: nowIso,
    });
    if (readyResponse.status !== "ready") {
      throw new Error("Google Calendar status response was not ready");
    }
    return readyResponse;
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
      this.logger.error(`google refresh token decrypt failed: ${message}`);
      return null;
    }
  }
}
