import { describe, expect, it } from "vitest";
import { isISODate, resolvePeriod } from "./dates";

describe("resolvePeriod", () => {
  const today = "2026-10-14"; // a Wednesday
  it("resolves presets", () => {
    expect(resolvePeriod("today", {}, today)).toMatchObject({ from: today, to: today });
    expect(resolvePeriod("this_week", {}, today)).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
    expect(resolvePeriod("this_month", {}, today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("last_month", {}, today)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("this_quarter", {}, today)).toMatchObject({ from: "2026-10-01", to: "2026-12-31" });
    expect(resolvePeriod("this_year", {}, today)).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolvePeriod("last_month", {}, "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("supports custom ranges and ignores invalid dates", () => {
    expect(resolvePeriod("custom", { from: "2026-10-01", to: "2026-10-31" }, today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("custom", { from: "2026-02-30" }, today).from).toBeNull();
  });
  it("validates ISO dates", () => {
    expect(isISODate("2026-10-08")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("08/10/2026")).toBe(false);
  });
});
