import { describe, expect, it } from "vitest";
import { validateGoogleClaims } from "./google";

const base = { sub: "1234", email: "ada@teasooconsulting.com", email_verified: true, hd: "teasooconsulting.com", nonce: "n1", given_name: "Ada", family_name: "Obi" };
const expected = { nonce: "n1", domain: "teasooconsulting.com" };

describe("validateGoogleClaims", () => {
  it("accepts verified company Workspace accounts", () => {
    expect(validateGoogleClaims(base, expected)).toEqual({ sub: "1234", email: "ada@teasooconsulting.com", firstName: "Ada", lastName: "Obi" });
  });
  it("rejects personal Gmail and other domains", () => {
    expect(() => validateGoogleClaims({ ...base, email: "ada@gmail.com", hd: undefined }, expected)).toThrow(/@teasooconsulting.com/);
    expect(() => validateGoogleClaims({ ...base, email: "ada@other.com", hd: "other.com" }, expected)).toThrow(/@teasooconsulting.com/);
  });
  it("rejects a matching email without the Workspace hd claim", () => {
    expect(() => validateGoogleClaims({ ...base, hd: undefined }, expected)).toThrow();
  });
  it("rejects unverified emails and nonce mismatches", () => {
    expect(() => validateGoogleClaims({ ...base, email_verified: false }, expected)).toThrow(/verified/);
    expect(() => validateGoogleClaims({ ...base, nonce: "other" }, expected)).toThrow(/did not match/);
  });
  it("falls back to the display name when given/family names are missing", () => {
    const r = validateGoogleClaims({ ...base, given_name: undefined, family_name: undefined, name: "Ngozi Ada Okafor" }, expected);
    expect(r.firstName).toBe("Ngozi");
    expect(r.lastName).toBe("Ada Okafor");
  });
});
