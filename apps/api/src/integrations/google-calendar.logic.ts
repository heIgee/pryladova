import { z } from "zod";

const calendarEventItemSchema = z.object({
  summary: z.string().optional(),
  status: z.string().optional(),
  transparency: z.string().optional(),
  start: z.object({
    dateTime: z.string().min(1).optional(),
    date: z.string().optional(),
    timeZone: z.string().min(1).optional(),
  }),
  end: z.object({
    dateTime: z.string().min(1).optional(),
    date: z.string().optional(),
    timeZone: z.string().min(1).optional(),
  }),
  organizer: z
    .object({
      email: z.string().email().optional(),
      self: z.boolean().optional(),
    })
    .optional(),
});

export type GoogleCalendarEventItem = z.infer<typeof calendarEventItemSchema>;

export const googleCalendarEventsSchema = z.object({
  items: z.array(calendarEventItemSchema).optional(),
});

/** Works with calendar.events.readonly — no openid/userinfo scope required. */
export const inferAccountEmailFromCalendarEvents = (
  events: GoogleCalendarEventItem[],
): string | null => {
  for (const event of events) {
    if (event.organizer?.self && event.organizer.email) {
      return event.organizer.email;
    }
  }
  for (const event of events) {
    if (event.organizer?.email) {
      return event.organizer.email;
    }
  }
  return null;
};

/** Prefer IANA zone from event payloads; calendar.events.readonly cannot read calendarList metadata. */
export const resolveCalendarTimeZone = (
  events: GoogleCalendarEventItem[],
  fallback = "UTC",
): string => {
  for (const event of events) {
    const timeZone = event.start.timeZone ?? event.end.timeZone;
    if (timeZone) {
      return timeZone;
    }
  }
  return fallback;
};

/** Fetch window for upcoming events (default 7 days). */
export const calendarFetchTimeMaxIso = (now = new Date(), horizonDays = 7): string =>
  new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000).toISOString();

const formatCalendarDateKey = (timeZone: string, instant: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const startOfCalendarDayMs = (timeZone: string, instant: Date): number => {
  const dateKey = formatCalendarDateKey(timeZone, instant);
  let low = instant.getTime() - 48 * 60 * 60 * 1000;
  let high = instant.getTime() + 48 * 60 * 60 * 1000;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const midKey = formatCalendarDateKey(timeZone, new Date(mid));
    if (midKey < dateKey) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const endOfCalendarDayIso = (timeZone: string, instant = new Date()): string => {
  const dayStart = startOfCalendarDayMs(timeZone, instant);
  const nextDayStart = startOfCalendarDayMs(timeZone, new Date(dayStart + 36 * 60 * 60 * 1000));
  return new Date(nextDayStart - 1).toISOString();
};

export type CalendarEventSlice = {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  date?: string;
};

const allDayStartMs = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);

/** Google end.date is exclusive for all-day events. */
const allDayEndMs = (endDate: string): number => allDayStartMs(endDate);

const mapCalendarEvent = (event: GoogleCalendarEventItem): CalendarEventSlice | null => {
  const title = event.summary?.trim() || "Untitled";

  if (event.start.date && event.end.date) {
    const startMs = allDayStartMs(event.start.date);
    const endMs = allDayEndMs(event.end.date);
    return {
      title,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs - 1).toISOString(),
      allDay: true,
      date: event.start.date,
    };
  }

  if (event.start.dateTime && event.end.dateTime) {
    return {
      title,
      startAt: event.start.dateTime,
      endAt: event.end.dateTime,
      allDay: false,
    };
  }

  return null;
};

const isCancelledOrFree = (event: GoogleCalendarEventItem): boolean =>
  event.status === "cancelled" || event.transparency === "transparent";

export const isActiveTimedMeeting = (event: GoogleCalendarEventItem, nowMs: number): boolean => {
  if (isCancelledOrFree(event)) {
    return false;
  }
  const startAt = event.start.dateTime;
  const endAt = event.end.dateTime;
  if (!startAt || !endAt) {
    return false;
  }
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  return startMs <= nowMs && nowMs < endMs;
};

export const isActiveAllDayEvent = (event: GoogleCalendarEventItem, nowMs: number): boolean => {
  if (isCancelledOrFree(event)) {
    return false;
  }
  const startDate = event.start.date;
  const endDate = event.end.date;
  if (!startDate || !endDate) {
    return false;
  }
  const startMs = allDayStartMs(startDate);
  const endMs = allDayEndMs(endDate);
  return startMs <= nowMs && nowMs < endMs;
};

export const pickCurrentEvent = (
  events: GoogleCalendarEventItem[],
  nowMs: number,
): CalendarEventSlice | null => {
  for (const event of events) {
    if (!isActiveTimedMeeting(event, nowMs) && !isActiveAllDayEvent(event, nowMs)) {
      continue;
    }
    return mapCalendarEvent(event);
  }
  return null;
};

export const pickUpcomingEvents = (
  events: GoogleCalendarEventItem[],
  nowMs: number,
  maxEvents = 3,
): CalendarEventSlice[] => {
  const upcoming: CalendarEventSlice[] = [];

  for (const event of events) {
    if (event.status === "cancelled") {
      continue;
    }
    if (isActiveTimedMeeting(event, nowMs) || isActiveAllDayEvent(event, nowMs)) {
      continue;
    }
    const mapped = mapCalendarEvent(event);
    if (!mapped) {
      continue;
    }
    if (Date.parse(mapped.startAt) <= nowMs) {
      continue;
    }
    upcoming.push(mapped);
    if (upcoming.length >= maxEvents) {
      break;
    }
  }

  return upcoming;
};
