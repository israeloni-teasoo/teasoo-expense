import { describe, expect, it } from "vitest";
import { generatePassword, passwordProblem } from "./password";

describe("generatePassword", () => {
  it("produces readable passwords that satisfy the password policy", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
      expect(passwordProblem(p)).toBeNull();
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(190);
  });
});
