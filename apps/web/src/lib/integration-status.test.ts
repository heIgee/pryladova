import { describe, expect, it } from "vitest";
import { integrationLoading, readGoogleAccountEmail } from "./integration-status.js";

describe("readGoogleAccountEmail", () => {
  it("prefers calendar account email", () => {
    expect(
      readGoogleAccountEmail(
        {
          status: "ready",
          accountEmail: "calendar@example.com",
          inMeeting: false,
          currentEvent: null,
          upcomingEvents: [],
          fetchedAt: "2026-01-01T12:00:00.000Z",
        },
        {
          status: "ready",
          accountEmail: "tasks@example.com",
          openCount: 0,
          dueTodayCount: 0,
          tasks: [],
          fetchedAt: "2026-01-01T12:00:00.000Z",
        },
      ),
    ).toBe("calendar@example.com");
  });

  it("falls back to tasks account email", () => {
    expect(
      readGoogleAccountEmail(integrationLoading, {
        status: "ready",
        accountEmail: "tasks@example.com",
        openCount: 0,
        dueTodayCount: 0,
        tasks: [],
        fetchedAt: "2026-01-01T12:00:00.000Z",
      }),
    ).toBe("tasks@example.com");
  });

  it("returns null when unavailable", () => {
    expect(readGoogleAccountEmail(integrationLoading, integrationLoading)).toBeNull();
  });
});
