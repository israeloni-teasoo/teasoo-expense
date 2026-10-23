import { describe, expect, it } from "vitest";
import { approversFor, executorsFor, formatQuantity, lineAmount, parseQuantity } from "./requisition-rules";

const s = { requisitionApproverId: "coo", requisitionApproverBackupId: "coo2", requisitionExecutorId: "mp", requisitionExecutorBackupId: null };

describe("approval chain", () => {
  it("sends staff requests to the COO (and backup)", () => {
    expect(approversFor(s, "staff")).toEqual(["coo", "coo2"]);
  });
  it("never lets someone approve their own request", () => {
    expect(approversFor(s, "coo")).toEqual(["coo2"]);
  });
  it("sends the COO's own request to the Managing Partner when there's no other approver", () => {
    expect(approversFor({ ...s, requisitionApproverBackupId: null }, "coo")).toEqual(["mp"]);
  });
  it("returns nobody when approvals aren't set up", () => {
    expect(approversFor({}, "staff")).toEqual([]);
  });
  it("lets the backup pay the MP's own request, else the MP", () => {
    expect(executorsFor({ ...s, requisitionExecutorBackupId: "mp2" }, "mp")).toEqual(["mp2"]);
    expect(executorsFor(s, "mp")).toEqual(["mp"]);
  });
});

describe("line maths", () => {
  it("multiplies quantity by rate and takes off the discount", () => {
    expect(lineAmount(parseQuantity("2")!, 150_000_00, 10_000_00)).toBe(290_000_00);
    expect(lineAmount(parseQuantity("1.5")!, 1000_00)).toBe(1500_00);
    expect(lineAmount(100, 100, 500)).toBe(0);
  });
  it("parses and prints quantities", () => {
    expect(parseQuantity("1,000")).toBe(100000);
    expect(parseQuantity("abc")).toBeNull();
    expect(formatQuantity(150)).toBe("1.5");
    expect(formatQuantity(200)).toBe("2");
  });
});
