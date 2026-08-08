import assert from "node:assert/strict";
import { shouldUseSecureSessionCookie } from "../lib/session-cookie-security.ts";

const loopbackUrls = {
  APP_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_PUBLIC_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_CONSOLE_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_ACCOUNT_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_SUPPORT_URL: "http://127.0.0.1:3000",
};

assert.equal(
  shouldUseSecureSessionCookie({ NODE_ENV: "development", APP_URL: "http://localhost:3000" }),
  false,
  "Development sessions must remain usable over local HTTP.",
);

assert.equal(
  shouldUseSecureSessionCookie({ NODE_ENV: "production", ...loopbackUrls }),
  false,
  "Production-like CI may relax Secure only when every configured runtime URL is explicit HTTP loopback.",
);

assert.equal(
  shouldUseSecureSessionCookie({ NODE_ENV: "production", APP_URL: "http://localhost:3000" }),
  false,
  "localhost is an explicit loopback runtime.",
);

assert.equal(
  shouldUseSecureSessionCookie({ NODE_ENV: "production", APP_URL: "http://[::1]:3000" }),
  false,
  "IPv6 loopback is an explicit loopback runtime.",
);

assert.equal(
  shouldUseSecureSessionCookie({
    NODE_ENV: "production",
    APP_URL: "https://app.dtsc-platform.com",
    NEXT_PUBLIC_ACCOUNT_URL: "https://account.dtsc-platform.com",
  }),
  true,
  "Production HTTPS must always set Secure cookies.",
);

assert.equal(
  shouldUseSecureSessionCookie({
    NODE_ENV: "production",
    APP_URL: "http://127.0.0.1:3000",
    NEXT_PUBLIC_APP_URL: "https://app.dtsc-platform.com",
  }),
  true,
  "Mixed loopback/remote configuration must fail safe to Secure cookies.",
);

assert.equal(
  shouldUseSecureSessionCookie({ NODE_ENV: "production", APP_URL: "http://10.0.0.10:3000" }),
  true,
  "Arbitrary production HTTP hosts must not relax Secure cookies.",
);

assert.equal(
  shouldUseSecureSessionCookie({ NODE_ENV: "production" }),
  true,
  "Missing Production URL configuration must fail safe to Secure cookies.",
);

console.log("Session cookie security QA passed (dev, loopback, IPv6, HTTPS, mixed and fail-safe cases).\n");
