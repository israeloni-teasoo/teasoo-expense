import { describe, expect, it } from "vitest";
import { pickActiveOrganisation } from "./org-access";
import { categoryLabel } from "./category-label";

const orgs = [{ organisationId: "a" }, { organisationId: "b" }];

describe("pickActiveOrganisation", () => {
  it("uses the remembered organisation when the person still belongs to it", () => {
    expect(pickActiveOrganisation(orgs, "b", "a")?.organisationId).toBe("b");
  });
  it("ignores a remembered organisation they no longer belong to", () => {
    expect(pickActiveOrganisation(orgs, "zzz", "b")?.organisationId).toBe("b");
  });
  it("falls back to the first organisation, or none", () => {
    expect(pickActiveOrganisation(orgs, undefined, "gone")?.organisationId).toBe("a");
    expect(pickActiveOrganisation([], "a", "a")).toBeNull();
  });
});

describe("categoryLabel", () => {
  it("shows the typed category for Others", () => {
    expect(categoryLabel("Others", " Gifts ")).toBe("Others: Gifts");
    expect(categoryLabel("Meals", null)).toBe("Meals");
    expect(categoryLabel(null, null)).toBe("—");
  });
});
