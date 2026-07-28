import type { UserRole } from "@prisma/client";
import {
  createInitialSessionWindow,
  renewSessionWindow,
  type SessionPolicyWindow,
} from "@/lib/session-policy";
import type { SessionIdleTimeoutMinutes } from "@/lib/session-config";

export const SESSION_COOKIE = "dtsc_session";

export type SessionContext = "GLOBAL_CLIENT" | "COMMUNITY" | "DTSC_INTERNAL" | "ORGANIZATION";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  activeContext?: SessionContext;
  activeOrganizationId?: string | null;
  activeOrganizationName?: string | null;
  activeOrganizationRole?: string | null;
  authTime?: number;
  issuedAt?: number;
  idleTimeoutMinutes?: SessionIdleTimeoutMinutes;
  absoluteExp?: number;
  exp: number;
};

export type SessionTokenIdentity = Omit<
  SessionPayload,
  "authTime" | "issuedAt" | "idleTimeoutMinutes" | "absoluteExp" | "exp"
>;

function base64UrlEncode(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64url");
  }

  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

export async function createSessionToken(
  identity: SessionTokenIdentity,
  secret: string,
  options: {
    idleTimeoutMinutes?: unknown;
    previous?: Pick<SessionPayload, "authTime" | "absoluteExp"> | null;
    nowSeconds?: number;
  } = {}
) {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  let window: SessionPolicyWindow | null;

  if (options.previous?.authTime) {
    window = renewSessionWindow({
      authTime: options.previous.authTime,
      absoluteExp: options.previous.absoluteExp,
      idleTimeoutMinutes: options.idleTimeoutMinutes,
      nowSeconds,
    });
  } else {
    window = createInitialSessionWindow(options.idleTimeoutMinutes, nowSeconds);
  }

  if (!window) {
    return null;
  }

  const session: SessionPayload = { ...identity, ...window };
  const encodedPayload = base64UrlEncode(JSON.stringify(session));
  const signature = await sign(encodedPayload, secret);

  return { token: `${encodedPayload}.${signature}`, session };
}

export async function verifySessionToken(token: string | undefined, secret: string) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (payload.absoluteExp && payload.absoluteExp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
