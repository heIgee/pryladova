import { describe, expect, it } from "vitest";
import {
  agentWsInboundSchema,
  githubStatusResponseSchema,
  googleCalendarStatusResponseSchema,
  googleTasksStatusResponseSchema,
  hostMediaSchema,
  hostPayloadForPanelWs,
  isRedactedTelemetry,
  mergeHostPayload,
  mergeTelemetryState,
  normalizeAppName,
  panelWsMessageSchema,
  parseGithubStatusResponse,
  parseGoogleCalendarStatusResponse,
  parseGoogleTasksStatusResponse,
  parseSteamStatusResponse,
  SECURE_APP_NAME,
  SECURE_WINDOW_TITLE,
  settingsSchema,
  steamStatusResponseSchema,
  telemetryPayloadSchema,
  weatherCodeToCondition,
  weatherResponseSchema,
} from "./index.js";

describe("normalizeAppName", () => {
  it("trims whitespace and rejects empty values", () => {
    expect(normalizeAppName(" Code ")).toBe("Code");
    expect(normalizeAppName("   ")).toBeNull();
  });
});

describe("telemetryPayloadSchema", () => {
  it("trims app and window names on parse", () => {
    expect(
      telemetryPayloadSchema.parse({
        appName: " Code ",
        windowTitle: " app.tsx ",
        capturedAt: "2026-01-01T12:00:00.000Z",
      }),
    ).toEqual({
      appName: "Code",
      windowTitle: "app.tsx",
      capturedAt: "2026-01-01T12:00:00.000Z",
    });
  });
});

describe("isRedactedTelemetry", () => {
  it("detects secure redacted payloads", () => {
    expect(isRedactedTelemetry(SECURE_APP_NAME, SECURE_WINDOW_TITLE)).toBe(true);
  });

  it("returns false for normal payloads", () => {
    expect(isRedactedTelemetry("Code", "app.tsx")).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("parses classification toggle", () => {
    expect(settingsSchema.parse({ classificationEnabled: true })).toEqual({
      classificationEnabled: true,
    });
  });
});

describe("agentWsInboundSchema", () => {
  it("parses update and shutdown messages with agentId", () => {
    expect(
      agentWsInboundSchema.parse({
        type: "update",
        agentId: "desk-pc",
        host: {
          idleMs: 0,
          cpuPercent: 1,
          ramPercent: 2,
          uptimeSec: 3,
          media: null,
          capturedAt: "2026-01-01T12:00:00.000Z",
        },
      }).type,
    ).toBe("update");

    expect(
      agentWsInboundSchema.parse({
        type: "shutdown",
        agentId: "desk-pc",
        capturedAt: "2026-01-01T12:00:00.000Z",
      }).type,
    ).toBe("shutdown");
  });
});

describe("hostMediaSchema", () => {
  it("accepts thumbnail data url", () => {
    const media = hostMediaSchema.parse({
      title: "Track",
      artist: "Artist",
      albumTitle: null,
      appName: "foobar",
      playbackStatus: "playing",
      thumbnailDataUrl: "data:image/jpeg;base64,abc",
    });
    expect(media.thumbnailDataUrl).toBe("data:image/jpeg;base64,abc");
  });

  it("accepts null thumbnail", () => {
    const media = hostMediaSchema.parse({
      title: "Track",
      artist: null,
      albumTitle: null,
      appName: null,
      playbackStatus: "paused",
      thumbnailDataUrl: null,
    });
    expect(media.thumbnailDataUrl).toBeNull();
  });

  it("defaults missing thumbnail to null", () => {
    const media = hostMediaSchema.parse({
      title: "Track",
      artist: null,
      albumTitle: null,
      appName: null,
      playbackStatus: "playing",
    });
    expect(media.thumbnailDataUrl).toBeNull();
  });

  it("rejects oversized thumbnail data url", () => {
    expect(() =>
      hostMediaSchema.parse({
        title: "Track",
        artist: null,
        albumTitle: null,
        appName: null,
        playbackStatus: "playing",
        thumbnailDataUrl: `data:image/jpeg;base64,${"a".repeat(512_001)}`,
      }),
    ).toThrow();
  });
});

describe("panel host ws helpers", () => {
  it("parses host-only panel websocket messages", () => {
    expect(
      panelWsMessageSchema.parse({
        type: "host",
        host: {
          idleMs: 0,
          cpuPercent: 10,
          ramPercent: 20,
          uptimeSec: 100,
          media: null,
          capturedAt: "2026-01-01T12:00:00.000Z",
        },
      }),
    ).toMatchObject({ type: "host" });
  });

  it("strips thumbnails from host-only payloads", () => {
    expect(
      hostPayloadForPanelWs({
        idleMs: 0,
        cpuPercent: 10,
        ramPercent: 20,
        uptimeSec: 100,
        capturedAt: "2026-01-01T12:00:00.000Z",
        media: {
          title: "Track",
          artist: "Artist",
          albumTitle: null,
          appName: "Player",
          playbackStatus: "playing",
          thumbnailDataUrl: "data:image/jpeg;base64,abc",
        },
      }).media?.thumbnailDataUrl,
    ).toBeNull();
  });

  it("preserves thumbnails across unchanged tracks", () => {
    const previous = {
      idleMs: 0,
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSec: 100,
      capturedAt: "2026-01-01T12:00:00.000Z",
      media: {
        title: "Track",
        artist: "Artist",
        albumTitle: null,
        appName: "Player",
        playbackStatus: "playing" as const,
        thumbnailDataUrl: "data:image/jpeg;base64,abc",
      },
    };
    const incoming = {
      ...previous,
      cpuPercent: 12,
      capturedAt: "2026-01-01T12:00:02.000Z",
      media: previous.media ? { ...previous.media, thumbnailDataUrl: null } : null,
    };

    expect(mergeHostPayload(previous, incoming).media?.thumbnailDataUrl).toBe(
      "data:image/jpeg;base64,abc",
    );
  });

  it("preserves host thumbnail when reconnecting telemetry snapshots", () => {
    const previous = {
      appName: "Code",
      windowTitle: "app.tsx",
      capturedAt: "2026-01-01T12:00:00.000Z",
      receivedAt: "2026-01-01T12:00:01.000Z",
      classification: null,
      classificationStatus: "disabled" as const,
      host: {
        idleMs: 0,
        cpuPercent: 10,
        ramPercent: 20,
        uptimeSec: 100,
        capturedAt: "2026-01-01T12:00:01.000Z",
        media: {
          title: "Track",
          artist: "Artist",
          albumTitle: null,
          appName: "Player",
          playbackStatus: "playing" as const,
          thumbnailDataUrl: "data:image/jpeg;base64,abc",
        },
      },
    };
    const incoming = {
      ...previous,
      receivedAt: "2026-01-01T12:00:05.000Z",
      host: {
        idleMs: 0,
        cpuPercent: 42,
        ramPercent: 20,
        uptimeSec: 105,
        capturedAt: "2026-01-01T12:00:05.000Z",
        media: {
          title: "Track",
          artist: "Artist",
          albumTitle: null,
          appName: "Player",
          playbackStatus: "playing" as const,
          thumbnailDataUrl: null,
        },
      },
    };

    expect(mergeTelemetryState(previous, incoming).host?.media?.thumbnailDataUrl).toBe(
      "data:image/jpeg;base64,abc",
    );
  });
});

describe("weatherResponseSchema", () => {
  it("parses ready response", () => {
    const response = weatherResponseSchema.parse({
      status: "ready",
      temperatureC: 22.4,
      weatherCode: 0,
      condition: "Clear",
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(response.status).toBe("ready");
  });

  it("parses disabled and unavailable", () => {
    expect(weatherResponseSchema.parse({ status: "disabled" }).status).toBe("disabled");
    expect(weatherResponseSchema.parse({ status: "unavailable" }).status).toBe("unavailable");
  });
});

describe("githubStatusResponseSchema", () => {
  it("parses ready response", () => {
    const response = parseGithubStatusResponse({
      status: "ready",
      username: "octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      profileUrl: "https://github.com/octocat",
      publicRepos: 12,
      followers: 42,
      commitsToday: 3,
      openPullRequests: 2,
      checks: [
        { repo: "pryladova", status: "success" },
        { repo: "other", status: "pending" },
      ],
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(response.status).toBe("ready");
    if (response.status === "ready") {
      expect(response.checks).toHaveLength(2);
    }
  });

  it("parses disabled and unavailable", () => {
    expect(githubStatusResponseSchema.parse({ status: "disabled" }).status).toBe("disabled");
    expect(githubStatusResponseSchema.parse({ status: "unavailable" }).status).toBe("unavailable");
  });
});

describe("steamStatusResponseSchema", () => {
  it("parses ready response", () => {
    const response = parseSteamStatusResponse({
      status: "ready",
      username: "example",
      personaState: "online",
      avatarUrl: "https://avatars.steamstatic.com/example.jpg",
      profileUrl: "https://steamcommunity.com/id/example",
      currentGame: { name: "Half-Life 2", sessionSec: 3600 },
      recentlyPlayed: [{ name: "Portal", playtime2WeeksMin: 120, iconUrl: null }],
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(response.status).toBe("ready");
    if (response.status === "ready") {
      expect(response.currentGame?.name).toBe("Half-Life 2");
      expect(response.recentlyPlayed).toHaveLength(1);
    }
  });

  it("parses disabled and unavailable", () => {
    expect(steamStatusResponseSchema.parse({ status: "disabled" }).status).toBe("disabled");
    expect(steamStatusResponseSchema.parse({ status: "unavailable" }).status).toBe("unavailable");
  });
});

describe("googleCalendarStatusResponseSchema", () => {
  it("parses ready response", () => {
    const response = parseGoogleCalendarStatusResponse({
      status: "ready",
      accountEmail: "user@example.com",
      inMeeting: true,
      currentEvent: {
        title: "Standup",
        startAt: "2026-01-01T10:00:00.000Z",
        endAt: "2026-01-01T10:30:00.000Z",
        allDay: false,
      },
      upcomingEvents: [],
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(response.status).toBe("ready");
  });

  it("preserves allDay and date on calendar events", () => {
    const response = parseGoogleCalendarStatusResponse({
      status: "ready",
      accountEmail: null,
      inMeeting: false,
      currentEvent: null,
      upcomingEvents: [
        {
          title: "test event",
          startAt: "2026-08-11T00:00:00.000Z",
          endAt: "2026-08-11T23:59:59.999Z",
          allDay: true,
          date: "2026-08-11",
        },
      ],
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    if (response.status !== "ready") {
      throw new Error("expected ready status");
    }
    expect(response.upcomingEvents[0]?.allDay).toBe(true);
    expect(response.upcomingEvents[0]?.date).toBe("2026-08-11");
  });

  it("parses disabled, needs_auth, unavailable, and misconfigured", () => {
    expect(googleCalendarStatusResponseSchema.parse({ status: "disabled" }).status).toBe(
      "disabled",
    );
    expect(googleCalendarStatusResponseSchema.parse({ status: "needs_auth" }).status).toBe(
      "needs_auth",
    );
    expect(googleCalendarStatusResponseSchema.parse({ status: "unavailable" }).status).toBe(
      "unavailable",
    );
    expect(googleCalendarStatusResponseSchema.parse({ status: "misconfigured" }).status).toBe(
      "misconfigured",
    );
  });
});

describe("googleTasksStatusResponseSchema", () => {
  it("parses ready response", () => {
    const response = parseGoogleTasksStatusResponse({
      status: "ready",
      accountEmail: "user@example.com",
      openCount: 2,
      dueTodayCount: 1,
      tasks: [{ title: "Ship", dueAt: "2026-01-01T12:00:00.000Z" }],
      fetchedAt: "2026-01-01T12:00:00.000Z",
    });
    expect(response.status).toBe("ready");
  });

  it("parses disabled, needs_auth, unavailable, and misconfigured", () => {
    expect(googleTasksStatusResponseSchema.parse({ status: "disabled" }).status).toBe("disabled");
    expect(googleTasksStatusResponseSchema.parse({ status: "needs_auth" }).status).toBe(
      "needs_auth",
    );
    expect(googleTasksStatusResponseSchema.parse({ status: "unavailable" }).status).toBe(
      "unavailable",
    );
    expect(googleTasksStatusResponseSchema.parse({ status: "misconfigured" }).status).toBe(
      "misconfigured",
    );
  });
});

describe("weatherCodeToCondition", () => {
  it("maps known WMO codes", () => {
    expect(weatherCodeToCondition(0)).toBe("Clear");
    expect(weatherCodeToCondition(61)).toBe("Rain");
  });

  it("returns Unknown for unmapped codes", () => {
    expect(weatherCodeToCondition(12345)).toBe("Unknown");
  });
});
