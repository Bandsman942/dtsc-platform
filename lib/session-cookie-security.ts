type SessionCookieEnvironment = {
  NODE_ENV?: string;
  APP_URL?: string;
  NEXT_PUBLIC_PUBLIC_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_CONSOLE_URL?: string;
  NEXT_PUBLIC_ACCOUNT_URL?: string;
  NEXT_PUBLIC_SUPPORT_URL?: string;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isHttpLoopbackUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function shouldUseSecureSessionCookie(
  environment: SessionCookieEnvironment = process.env,
) {
  if (environment.NODE_ENV !== "production") return false;

  const configuredRuntimeUrls = [
    environment.APP_URL,
    environment.NEXT_PUBLIC_PUBLIC_URL,
    environment.NEXT_PUBLIC_APP_URL,
    environment.NEXT_PUBLIC_CONSOLE_URL,
    environment.NEXT_PUBLIC_ACCOUNT_URL,
    environment.NEXT_PUBLIC_SUPPORT_URL,
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean);

  // Fail safe in Production. The Secure flag may be relaxed only for an
  // explicitly configured, all-loopback HTTP runtime such as local CI running
  // `next start`. A mixed or missing configuration always keeps Secure=true.
  if (!configuredRuntimeUrls.length) return true;
  return !configuredRuntimeUrls.every(isHttpLoopbackUrl);
}
