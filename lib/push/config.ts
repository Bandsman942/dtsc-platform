export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getWebPushConfig(): WebPushConfig | null {
  const publicKey = (process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.WEB_PUSH_SUBJECT || "mailto:contact@dtsc-platform.com").trim();

  if (!publicKey || !privateKey || !subject) {
    return null;
  }
  if (!subject.startsWith("mailto:") && !subject.startsWith("https:")) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured() {
  return Boolean(getWebPushConfig());
}

export function getPublicWebPushVapidKey() {
  return (process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "").trim() || null;
}
