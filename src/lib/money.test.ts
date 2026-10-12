import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, koboToInput, parseMoney } from "./money";

describe("parseMoney", () => {
  it("parses naira strings into integer kobo without floating point", () => {
    expect(parseMoney("85,000")).toBe(8_500_000);
    expect(parseMoney("₦85,000.50")).toBe(8_500_050);
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney("0.29")).toBe(29); // 0.29 * 100 = 28.999999999999996 in floats
    expect(parseMoney("1234567.89")).toBe(123_456_789);
    expect(parseMoney("NGN 500")).toBe(50_000);
    expect(parseMoney(85000)).toBe(8_500_000);
  });
  it("rejects invalid input", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("1e5")).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
  it("handles negatives for corrections", () => {
    expect(parseMoney("-50,000")).toBe(-5_000_000);
  });
});

describe("formatting", () => {
  it("formats kobo as naira", () => {
    expect(formatMoney(8_500_000)).toBe("₦85,000");
    expect(formatMoney(8_500_050)).toBe("₦85,000.50");
    expect(formatMoney(-5_000_000)).toBe("-₦50,000");
    expect(formatMoney(10_000_000, { sign: true })).toBe("+₦100,000");
  });
  it("formats compact amounts", () => {
    expect(formatMoneyCompact(50_000_000)).toBe("₦500k");
    expect(formatMoneyCompact(120_000_000)).toBe("₦1.2m");
  });
  it("round-trips to form input", () => {
    expect(koboToInput(8_500_050)).toBe("85000.50");
    expect(parseMoney(koboToInput(123_456_789))).toBe(123_456_789);
  });
});
