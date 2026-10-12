import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain letters and numbers.";
  return null;
}

export function createResetToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Readable but strong temporary password, e.g. "Kite-Mango-4827". */
export function generatePassword() {
  const words = ["Amber", "Baobab", "Cedar", "Delta", "Ember", "Falcon", "Garnet", "Harbor", "Indigo", "Jasper", "Kite", "Lagoon", "Mango", "Niger", "Onyx", "Palm", "Quartz", "River", "Savanna", "Tiger", "Umber", "Violet", "Willow", "Zebra"];
  const pick = () => words[randomInt(words.length)];
  return `${pick()}-${pick()}-${randomInt(1000, 10000)}`;
}
