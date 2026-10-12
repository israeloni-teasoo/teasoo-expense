import { describe, expect, it } from "vitest";
import { suggestCategory } from "./suggest";

const cats = [
  { id: "internet", name: "Internet", keywords: "internet,wifi,data" },
  { id: "software", name: "Software", keywords: "subscription,adobe,canva" },
  { id: "transport", name: "Transportation", keywords: "taxi,uber,fuel" },
];

describe("suggestCategory", () => {
  it("suggests a category from the description", () => {
    expect(suggestCategory("Paid for office internet renewal", cats)).toBe("internet");
    expect(suggestCategory("Adobe Creative Cloud subscription", cats)).toBe("software");
    expect(suggestCategory("Uber to client site", cats)).toBe("transport");
  });
  it("returns null when nothing matches", () => {
    expect(suggestCategory("Lunch with team", cats)).toBeNull();
  });
});
