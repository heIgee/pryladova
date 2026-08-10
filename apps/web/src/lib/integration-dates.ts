const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_WITHIN_DAYS = 7;

export const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const calendarDayDiff = (from: Date, to: Date): number => {
  const fromStart = startOfLocalDay(from).getTime();
  const toStart = startOfLocalDay(to).getTime();
  return Math.round((toStart - fromStart) / MS_PER_DAY);
};

export const isWithinWeek = (date: Date, now = new Date()): boolean =>
  Math.abs(calendarDayDiff(now, date)) <= WEEKDAY_WITHIN_DAYS;

export const parseCalendarDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatIntegrationDate = (date: Date, now = new Date()): string => {
  if (Number.isNaN(date.getTime())) {
    return String(date);
  }
  const includeWeekday = isWithinWeek(date, now);
  const includeYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleDateString(undefined, {
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
};

export const formatIntegrationDateFromKey = (dateKey: string, now = new Date()): string =>
  formatIntegrationDate(parseCalendarDateKey(dateKey), now);

export const formatIntegrationTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export const isSameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();
