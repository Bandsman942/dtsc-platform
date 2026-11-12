import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type HirmsCredentials = { username: string; secret: string };

// AES-256-GCM server-side envelope encryption; the key must come from the protected environment.
function encryptionKey() {
  const raw = process.env.HEALTH_INSURANCE_CREDENTIALS_KEY || "";
  const bytes = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("HEALTH_CONNECTOR_ENCRYPTION_NOT_CONFIGURED");
  return bytes;
}
export function sealHirmsCredentials(value: HirmsCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".");
}
export function openHirmsCredentials(value: string): HirmsCredentials {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("HEALTH_CONNECTOR_CREDENTIALS_INVALID");
  const [iv, tag, payload] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || !("username" in parsed) || !("secret" in parsed)
     || typeof parsed.username !== "string" || typeof parsed.secret !== "string") {
    throw new Error("HEALTH_CONNECTOR_CREDENTIALS_INVALID");
  }
  return { username: parsed.username, secret: parsed.secret };
}
