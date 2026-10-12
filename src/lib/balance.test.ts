import { describe, expect, it } from "vitest";
import { computeBalance } from "./balance";

const N = (n: number) => n * 100;

describe("computeBalance", () => {
  it("matches the spec example: ₦500k with ₦210k spent leaves ₦290k", () => {
    const b = computeBalance({
      initialAmount: N(500_000),
      adjustments: [],
      returns: [],
      expenses: [
        { amount: N(85_000), status: "APPROVED" },
        { amount: N(40_000), status: "APPROVED" },
        { amount: N(50_000), status: "SUBMITTED" },
        { amount: N(35_000), status: "UNDER_REVIEW" },
      ],
    });
    expect(b.spent).toBe(N(210_000));
    expect(b.available).toBe(N(290_000));
    expect(b.pending).toBe(N(85_000));
    expect(b.approved).toBe(N(125_000));
  });

  it("recalculates when an expense is rejected", () => {
    const b = computeBalance({
      initialAmount: N(500_000),
      adjustments: [],
      returns: [],
      expenses: [
        { amount: N(100_000), status: "REJECTED" },
        { amount: N(50_000), status: "APPROVED" },
        { amount: N(25_000), status: "SUBMITTED" },
      ],
    });
    expect(b.available).toBe(N(425_000));
    expect(b.rejected).toBe(N(100_000));
  });

  it("ignores drafts and voided expenses", () => {
    const b = computeBalance({
      initialAmount: N(100_000),
      adjustments: [],
      returns: [],
      expenses: [
        { amount: N(10_000), status: "DRAFT" },
        { amount: N(20_000), status: "VOIDED" },
      ],
    });
    expect(b.available).toBe(N(100_000));
    expect(b.counts.total).toBe(1);
    expect(b.counts.draft).toBe(1);
  });

  it("reconciles the end-to-end scenario to zero", () => {
    const b = computeBalance({
      initialAmount: N(1_000_000),
      adjustments: [],
      returns: [{ amount: N(550_000) }],
      expenses: [100_000, 75_000, 150_000, 80_000, 45_000].map((n) => ({ amount: N(n), status: "APPROVED" as const })),
    });
    expect(b.approved).toBe(N(450_000));
    expect(b.outstanding).toBe(0);
    expect(b.available).toBe(0);
  });

  it("flags over-spending and accounts for additional funding", () => {
    const over = computeBalance({
      initialAmount: N(500_000),
      adjustments: [],
      returns: [],
      expenses: [{ amount: N(550_000), status: "APPROVED" }],
    });
    expect(over.overBudget).toBe(true);
    expect(over.overspend).toBe(N(50_000));
    expect(over.available).toBe(-N(50_000));

    const topped = computeBalance({
      initialAmount: N(500_000),
      adjustments: [{ amount: N(100_000) }],
      returns: [],
      expenses: [{ amount: N(550_000), status: "APPROVED" }],
    });
    expect(topped.totalFunded).toBe(N(600_000));
    expect(topped.available).toBe(N(50_000));
    expect(topped.overBudget).toBe(false);
  });
});
