import { describe, expect, it } from "vitest";
import {
  formatIntegrationDate,
  formatIntegrationDateFromKey,
  isWithinWeek,
} from "./integration-dates.js";

describe("integration-dates", () => {
  const now = new Date(2026, 7, 10, 14, 0, 0);

  it("includes weekday within 7 calendar days", () => {
    const tomorrow = new Date(2026, 7, 11);
    expect(isWithinWeek(tomorrow, now)).toBe(true);
    expect(formatIntegrationDate(tomorrow, now)).toMatch(/^Tue/);
    expect(formatIntegrationDateFromKey("2026-08-11", now)).toMatch(/^Tue/);
  });

  it("omits weekday beyond 7 calendar days", () => {
    const later = new Date(2026, 7, 20);
    expect(isWithinWeek(later, now)).toBe(false);
    expect(formatIntegrationDate(later, now)).not.toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
  });

  it("includes year when not the current year", () => {
    const nextYear = new Date(2027, 0, 5);
    expect(formatIntegrationDate(nextYear, now)).toContain("2027");
  });
});
