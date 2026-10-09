import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  indianDate,
  indianMonth,
  monthBounds,
  parseMonthOr,
  recentMonths,
  startOfIndianDay,
  wholeYearsBetween,
} from "@/domain/time";

describe("India-time dates", () => {
  it("[U-AN-06] counts the day in India, not UTC", () => {
    // 18:29 UTC is 23:59 IST; 18:30 UTC is already the next Indian day.
    expect(indianDate(new Date("2026-03-31T18:29:59Z"))).toBe("2026-03-31");
    expect(indianDate(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
    expect(indianMonth(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04");
    expect(startOfIndianDay("2026-04-01").toISOString()).toBe("2026-03-31T18:30:00.000Z");
  });

  it("[U-AN-07] parses a month and falls back to the current one", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(parseMonthOr("2026-07", now)).toBe("2026-07");
    expect(parseMonthOr("2026-13", now)).toBe("2026-10");
    expect(parseMonthOr("july", now)).toBe("2026-10");
    expect(parseMonthOr(undefined, now)).toBe("2026-10");
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(monthBounds("2026-02").last).toBe("2026-02-28");
  });

  it("[U-AN-08] lists recent months newest first, across a year end", () => {
    expect(recentMonths(4, new Date("2026-02-10T00:00:00Z"))).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("[U-AN-09] counts whole contract years", () => {
    expect(wholeYearsBetween("2024-04-01", "2026-10-01")).toBe(2);
    expect(wholeYearsBetween("2025-10-15", "2026-10-01")).toBe(0);
    expect(wholeYearsBetween("2025-10-01", "2026-10-01")).toBe(1);
    expect(wholeYearsBetween("2026-04-01", "2026-03-01")).toBe(0);
  });
});
