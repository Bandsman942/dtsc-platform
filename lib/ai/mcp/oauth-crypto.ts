import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function encryptionKey() {
  const raw = process.env.DTSC_MCP_OAUTH_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("MCP_OAUTH_ENCRYPTION_KEY_MISSING");

  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MCP_OAUTH_ENCRYPTION_KEY_INVALID");
  return key;
}

export function encryptMcpOAuthSecret(value: string, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMcpOAuthSecret(payload: string, aad: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw, extra] = payload.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !ciphertextRaw || extra) throw new Error("MCP_OAUTH_SECRET_FORMAT_INVALID");

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function mcpOAuthConnectionAad(input: { userId: string; organizationId: string; serverCode: string }) {
  return `mcp-oauth:connection:${input.userId}:${input.organizationId}:${input.serverCode}`;
}

export function mcpOAuthStateAad(input: { userId: string; organizationId: string; serverCode: string; state: string }) {
  return `mcp-oauth:state:${input.userId}:${input.organizationId}:${input.serverCode}:${input.state}`;
}
