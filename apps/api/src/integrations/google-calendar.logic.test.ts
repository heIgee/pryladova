import { describe, expect, it } from "vitest";
import {
  endOfCalendarDayIso,
  inferAccountEmailFromCalendarEvents,
  isActiveAllDayEvent,
  pickCurrentEvent,
  pickUpcomingEvents,
  resolveCalendarTimeZone,
} from "./google-calendar.logic.js";

describe("google-calendar.logic", () => {
  it("computes end of calendar day in timezone", () => {
    const instant = new Date("2026-08-10T15:00:00.000Z");
    const endIso = endOfCalendarDayIso("Europe/Kyiv", instant);
    expect(endIso.endsWith("Z") || endIso.includes("+")).toBe(true);
    expect(Date.parse(endIso)).toBeGreaterThan(instant.getTime());
  });

  it("picks current timed meeting", () => {
    const nowMs = Date.parse("2026-08-10T10:30:00.000Z");
    const current = pickCurrentEvent(
      [
        {
          summary: "Standup",
          start: { dateTime: "2026-08-10T10:00:00.000Z" },
          end: { dateTime: "2026-08-10T11:00:00.000Z" },
        },
      ],
      nowMs,
    );

    expect(current?.title).toBe("Standup");
    expect(current?.allDay).toBe(false);
  });

  it("includes all-day events happening today", () => {
    const nowMs = Date.parse("2026-08-10T10:30:00.000Z");
    const current = pickCurrentEvent(
      [
        {
          summary: "Holiday",
          start: { date: "2026-08-10" },
          end: { date: "2026-08-11" },
        },
      ],
      nowMs,
    );

    expect(current?.title).toBe("Holiday");
    expect(current?.allDay).toBe(true);
    expect(
      isActiveAllDayEvent(
        {
          summary: "Holiday",
          start: { date: "2026-08-10" },
          end: { date: "2026-08-11" },
        },
        nowMs,
      ),
    ).toBe(true);
  });

  it("picks upcoming timed and all-day events after now", () => {
    const nowMs = Date.parse("2026-08-10T10:00:00.000Z");

    const upcoming = pickUpcomingEvents(
      [
        {
          summary: "Later today",
          start: { dateTime: "2026-08-10T14:00:00.000Z" },
          end: { dateTime: "2026-08-10T15:00:00.000Z" },
        },
        {
          summary: "test event",
          start: { date: "2026-08-11" },
          end: { date: "2026-08-12" },
        },
        {
          summary: "Past",
          start: { dateTime: "2026-08-10T08:00:00.000Z" },
          end: { dateTime: "2026-08-10T09:00:00.000Z" },
        },
      ],
      nowMs,
      3,
    );

    expect(upcoming.map((event) => event.title)).toEqual(["Later today", "test event"]);
    expect(upcoming[1]?.allDay).toBe(true);
    expect(upcoming[1]?.date).toBe("2026-08-11");
  });

  it("resolves timezone from event payloads", () => {
    expect(
      resolveCalendarTimeZone([
        {
          start: { dateTime: "2026-08-10T14:00:00.000Z", timeZone: "Europe/Kyiv" },
          end: { dateTime: "2026-08-10T15:00:00.000Z" },
        },
      ]),
    ).toBe("Europe/Kyiv");
    expect(resolveCalendarTimeZone([])).toBe("UTC");
  });

  it("infers account email from calendar event organizer", () => {
    expect(
      inferAccountEmailFromCalendarEvents([
        {
          summary: "test event",
          organizer: { email: "user@example.com", self: true },
          start: { date: "2026-08-11" },
          end: { date: "2026-08-12" },
        },
      ]),
    ).toBe("user@example.com");
  });
});
