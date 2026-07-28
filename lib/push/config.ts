import { Buffer } from "node:buffer";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type WebPushConfigurationIssue =
  | "missing-public-key"
  | "missing-private-key"
  | "invalid-public-key"
  | "invalid-private-key"
  | "invalid-subject";

function decodedBase64UrlLength(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return -1;
  try {
    return Buffer.from(value, "base64url").length;
  } catch {
    return -1;
  }
}

export function getWebPushConfigurationState(): {
  configured: boolean;
  issue: WebPushConfigurationIssue | null;
  config: WebPushConfig | null;
} {
  const publicKey = (process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.WEB_PUSH_SUBJECT || "mailto:contact@dtsc-platform.com").trim();

  if (!publicKey) {
    return { configured: false, issue: "missing-public-key", config: null };
  }
  if (!privateKey) {
    return { configured: false, issue: "missing-private-key", config: null };
  }
  if (decodedBase64UrlLength(publicKey) !== 65) {
    return { configured: false, issue: "invalid-public-key", config: null };
  }
  if (decodedBase64UrlLength(privateKey) !== 32) {
    return { configured: false, issue: "invalid-private-key", config: null };
  }
  if (!subject || (!subject.startsWith("mailto:") && !subject.startsWith("https:"))) {
    return { configured: false, issue: "invalid-subject", config: null };
  }

  return {
    configured: true,
    issue: null,
    config: { publicKey, privateKey, subject },
  };
}

export function getWebPushConfig(): WebPushConfig | null {
  return getWebPushConfigurationState().config;
}

export function isWebPushConfigured() {
  return getWebPushConfigurationState().configured;
}

export function getPublicWebPushVapidKey() {
  return getWebPushConfigurationState().config?.publicKey || null;
}
