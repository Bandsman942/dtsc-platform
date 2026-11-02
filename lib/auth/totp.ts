import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_SECONDS = 30;
const DIGITS = 6;

/** The secret is created with cryptographically secure random bytes, never with Math.random. */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits) result += ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

export function decodeBase32(secret: string): Buffer {
  const normalized = secret.trim().toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]{16,128}$/.test(normalized)) throw new Error("Invalid TOTP secret");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    value = (value << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
    value &= (1 << bits) - 1;
  }
  const decoded = Buffer.from(bytes);
  if (encodeBase32(decoded) !== normalized) throw new Error("Noncanonical TOTP secret");
  return decoded;
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function getTotpProvisioningUri(secret: string, accountEmail: string, issuer = "DTSC Platform"): string {
  decodeBase32(secret);
  const label = encodeURIComponent(issuer + ":" + accountEmail.trim().toLowerCase());
  const query = new URLSearchParams({
    secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD_SECONDS),
  });
  return "otpauth://totp/" + label + "?" + query.toString();
}

/** RFC 6238, SHA-1, 30-second period, six-digit authenticator interoperability. */
export function generateTotpCode(secret: string, step: number): string {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error("Invalid TOTP step");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(value).padStart(DIGITS, "0");
}

/** Returns the matched time step; caller MUST atomically persist it to prevent replay. */
export function verifyTotpCode(
  secret: string,
  code: string,
  options: { nowMs?: number; lastAcceptedStep?: number | null; windowSteps?: number } = {},
): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs) || nowMs < 0) return null;
  const windowSteps = options.windowSteps ?? 1;
  if (!Number.isInteger(windowSteps) || windowSteps < 0 || windowSteps > 1) throw new Error("Invalid TOTP window");
  const current = Math.floor(nowMs / (PERIOD_SECONDS * 1000));
  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const step = current + delta;
    if (step < 0 || (options.lastAcceptedStep != null && step <= options.lastAcceptedStep)) continue;
    const candidate = generateTotpCode(secret, step);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) return step;
  }
  return null;
}

export function getTotpEncryptionKey(): Buffer {
  const encoded = process.env.AUTH_TOTP_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY must contain 32 random bytes in base64url");
  }
  return key;
}

/** Encrypted at rest using AES-256-GCM; never store plaintext or the otpauth URI. */
export function encryptTotpSecret(secret: string, key = getTotpEncryptionKey()): string {
  decodeBase32(secret);
  if (key.length !== 32) throw new Error("Invalid encryption key");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptTotpSecret(ciphertext: string, key = getTotpEncryptionKey()): string {
  if (key.length !== 32) throw new Error("Invalid encryption key");
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid encrypted TOTP secret");
  const nonce = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const encrypted = Buffer.from(parts[3], "base64url");
  if (nonce.length !== 12 || tag.length !== 16 || encrypted.length < 1) throw new Error("Invalid encrypted TOTP secret");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const secret = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  decodeBase32(secret);
  return secret;
}

function normalizeRecoveryCode(code: string): string | null {
  const normalized = code.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z2-7]{20}$/.test(normalized) ? normalized : null;
}

/** High-entropy recovery tokens; only return plaintext once during enrollment. */
export function generateRecoveryCodes(count = 10): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Invalid recovery code count");
  return Array.from({ length: count }, () => {
    const raw = encodeBase32(randomBytes(12));
    return raw.match(/.{1,4}/g)!.join("-");
  });
}

/** SHA-256 is suitable for independently random 96-bit tokens (not user passwords). */
export function hashRecoveryCode(code: string): string | null {
  const normalized = normalizeRecoveryCode(code);
  return normalized ? createHash("sha256").update(normalized, "utf8").digest("hex") : null;
}
