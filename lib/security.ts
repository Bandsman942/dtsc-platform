import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString(
    "base64url"
  );

  return `pbkdf2:${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [scheme, iterations, salt, storedHash] = passwordHash.split(":");
  if (scheme !== "pbkdf2" || !iterations || !salt || !storedHash) {
    return false;
  }

  const candidate = pbkdf2Sync(
    password,
    salt,
    Number(iterations),
    KEY_LENGTH,
    DIGEST
  );
  const stored = Buffer.from(storedHash, "base64url");

  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
