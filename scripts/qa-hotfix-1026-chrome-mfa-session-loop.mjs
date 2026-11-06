import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function load(file, dependencies = {}) {
  const { outputText } = ts.transpileModule(read(file), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const instance = { exports: {} };
  const requireDependency = (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : nativeRequire(name);
  new Function("require", "module", "exports", outputText)(requireDependency, instance, instance.exports);
  return instance.exports;
}

const signedCookie = {
  userId: "account-test", sessionId: "previous-device", role: "ADMIN", email: "test@example.test",
  mfaVerifiedAt: Date.now() - 1_000, activeContext: "DTSC_INTERNAL", activeOrganizationId: "dtsc-internal",
};
const originByHost = {
  account: "https://account.dtsc-platform.com",
  console: "https://console.dtsc-platform.com",
  app: "https://app.dtsc-platform.com",
  support: "https://support.dtsc-platform.com",
  public: "https://dtsc-platform.com",
};
const nextResponse = {
  next: () => ({ kind: "next", cookies: { set() {} } }),
  redirect: (url) => ({ kind: "redirect", url: String(url) }),
  json: (body, options = {}) => ({ kind: "json", body, status: options.status ?? 200, headers: options.headers || {} }),
};
const currentHost = (host) => Object.keys(originByHost).find((name) => new URL(originByHost[name]).host === host) || "unknown";
const getSignInUrl = (next) => `https://account.dtsc-platform.com/auth/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;
const middleware = load("middleware.ts", {
  "next/server": { NextResponse: nextResponse },
  "@/lib/domains": {
    buildUrlForHostType: (host, path) => `${originByHost[host]}${path}`,
    getAuthCookieDomain: () => ".dtsc-platform.com",
    getCurrentHostType: currentHost,
    getDashboardUrl: () => `${originByHost.app}/dashboard`,
    getSignInUrl,
  },
  "@/lib/request-security": { isSameOriginRequest: () => true },
  "@/lib/session-config": { SESSION_HEARTBEAT_THROTTLE_MS: 60_000 },
  "@/lib/session-cookie-security": { shouldUseSecureSessionCookie: () => true },
  "@/lib/session-policy": { sessionCookieMaxAgeSeconds: () => 1_800 },
  "@/lib/session": {
    SESSION_COOKIE: "dtsc_session",
    verifySessionToken: async (token) => token === "signed-but-revoked-cookie" ? signedCookie : null,
    createSessionToken: async () => null,
  },
});
const browserRequest = (url, cookie = "signed-but-revoked-cookie") => {
  const parsed = new URL(url);
  return {
    url, nextUrl: parsed, method: "GET", headers: new Headers({ host: parsed.host }),
    cookies: { get: () => cookie ? { value: cookie } : undefined },
  };
};

// Reproducer: a signed cookie may no longer authorize server-side access.
// Account must never forward it to Console before the database/MFA checks.
const previousAuthSecret = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "test-signature-validation-secret";
for (const path of ["/auth/sign-in", "/auth/sign-up"]) {
  const decision = await middleware.middleware(browserRequest(`${originByHost.account}${path}?next=%2Fadmin`));
  assert.equal(decision.kind, "next", `${path} must not redirect solely from stale MFA cookie`);
  const anonymous = await middleware.middleware(browserRequest(`${originByHost.account}${path}`, null));
  assert.equal(anonymous.kind, "next", `${path} must also remain available without any cookie`);
}
const consoleDecision = await middleware.middleware(browserRequest(`${originByHost.console}/admin`));
assert.equal(consoleDecision.kind, "next", "Edge remains a routing guard, not a database authorization authority");
const rejectedConsole = await middleware.middleware(browserRequest(`${originByHost.console}/admin`, null));
assert.equal(rejectedConsole.kind, "redirect", "Unauthenticated Console still requires login");
assert.ok(rejectedConsole.url.startsWith(`${originByHost.account}/auth/sign-in`));
if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
else process.env.AUTH_SECRET = previousAuthSecret;

const redirectHelpers = load("lib/post-login-redirect.ts", {
  "@/lib/domains": {
    buildUrlForHostType: (host, path) => `${originByHost[host]}${path}`,
    getConsoleUrl: (path) => `${originByHost.console}${path}`,
    getCurrentHostType: currentHost,
    getDashboardUrl: () => `${originByHost.app}/dashboard`,
    getPublicUrl: (path) => `${originByHost.public}${path}`,
    getSupportUrl: (path) => `${originByHost.support}${path}`,
  },
});
const landing = load("lib/auth/account-landing-redirect.ts", {
  "@/lib/post-login-redirect": redirectHelpers,
});
assert.equal(landing.resolveValidatedAccountLandingRedirect(null, { next: "/admin" }), null,
  "Revoked/MFA-rejected signed cookie must display sign-in");
assert.equal(landing.resolveValidatedAccountLandingRedirect(signedCookie, { reason: "session-expired" }), null,
  "Explicit reconnection should not automatically navigate away");
assert.equal(landing.resolveValidatedAccountLandingRedirect({ ...signedCookie, mfaVerifiedAt: undefined }, {}), null,
  "Preserve original behavior of a valid non-MFA session at the login form");
assert.equal(landing.resolveValidatedAccountLandingRedirect(signedCookie, { next: "/admin" }),
  `${originByHost.console}/admin`, "Authoritatively validated MFA session may proceed to Console");
assert.equal(landing.resolveValidatedAccountLandingRedirect(signedCookie, { next: "https://attacker.example/steal" }),
  `${originByHost.console}/admin`, "Untrusted external next must not become an open redirect");
assert.equal(landing.resolveValidatedAccountLandingRedirect(signedCookie, { next: "//attacker.example/steal" }),
  `${originByHost.console}/admin`, "Protocol-relative external next must be rejected");
assert.equal(landing.resolveValidatedAccountLandingRedirect({ ...signedCookie, activeContext: "ORGANIZATION" }, {}),
  `${originByHost.app}/dashboard`, "An external-organization context defaults to App");

let authoritativeSession = null;
const redirect = (url) => { const failure = new Error("NEXT_REDIRECT"); failure.destination = url; throw failure; };
const jsx = (tag, props) => ({ tag, props });
const pageDeps = {
  "react": { Suspense: () => null },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: Symbol.for("react.fragment") },
  "next/headers": { headers: async () => new Headers({ host: "account.dtsc-platform.com" }) },
  "next/navigation": { redirect },
  "@/components/auth/account-product-shell": { AccountProductShell: () => null },
  "@/components/auth/auth-form": { AuthForm: () => null },
  "@/lib/auth": { getSession: async () => authoritativeSession },
  "@/lib/auth/account-landing-redirect": landing,
  "@/lib/domains": { getCurrentHostType: currentHost },
  "@/lib/organizations": { isDtscInternalSession: (session) => Boolean(session) },
};
for (const path of ["app/auth/sign-in/page.tsx", "app/auth/sign-up/page.tsx"]) {
  const page = load(path, pageDeps).default;
  authoritativeSession = null;
  assert.ok(await page({ searchParams: Promise.resolve({ next: "/admin" }) }),
    `${path}: rejected session renders the form instead of redirecting to Console`);
  authoritativeSession = signedCookie;
  await assert.rejects(() => page({ searchParams: Promise.resolve({ next: "/admin" }) }),
    (error) => error.destination === `${originByHost.console}/admin`,
    `${path}: a verified server session still reaches Console`);
  assert.ok(await page({ searchParams: Promise.resolve({ reason: "session-expired" }) }),
    `${path}: explicit reconnection remains accessible`);
}

const status = load("app/api/auth/heartbeat/route.ts", {
  "next/server": { NextResponse: nextResponse },
  "@/lib/auth": { getSession: async () => authoritativeSession, setSessionCookie: () => { throw new Error("GET must not renew a session"); }, clearSessionCookie: () => {} },
  "@/lib/prisma": { prisma: {} },
  "@/lib/rate-limit": { rateLimit: async () => ({ ok: true }), getRateLimitKey: () => "test" },
  "@/lib/request-security": { isSameOriginRequest: () => true },
  "@/lib/session-preference": { getUserSessionIdleTimeoutMinutes: async () => 30 },
  "@/lib/session-policy": { sessionWarningSeconds: () => 60 },
});
authoritativeSession = signedCookie;
const accepted = await status.GET();
assert.equal(accepted.status, 200);
assert.equal(accepted.body.ok, true);
assert.equal(accepted.headers["Cache-Control"], "no-store");
authoritativeSession = null;
const rejected = await status.GET();
assert.equal(rejected.status, 401, "Server revocation/MFA failure is not authenticated");
assert.equal(rejected.headers["Cache-Control"], "no-store");

const clientCheck = load("lib/client/session-status-check.ts").isCurrentSessionRejected;
const mockFetch = (statusCode) => async (url, options) => {
  assert.equal(url, "/api/auth/heartbeat");
  assert.equal(options.method, "GET");
  assert.equal(options.cache, "no-store");
  return { status: statusCode };
};
assert.equal(await clientCheck(mockFetch(200)), false, "Old tab logout must not expire a new valid session");
assert.equal(await clientCheck(mockFetch(401)), true, "Revoked session must still expire");
assert.equal(await clientCheck(mockFetch(503)), false, "Temporary backend unavailability must not force a reload loop");
assert.equal(await clientCheck(async () => { throw new Error("offline"); }), false,
  "Network interruption must not force a reload loop");

const sync = read("components/auth/session-timeout-guard.tsx");
assert.ok(sync.includes("peerLogoutValidation") && sync.includes("isCurrentSessionRejected()") &&
  sync.includes("navigateToSessionExpired(router, \"session-sync-logout\")"),
  "Cross-tab logout should be deduplicated and server-verified before navigation");
assert.ok(!sync.includes("if (message.type === \"logout\") {\n        if (expiredRef.current) return;\n        expiredRef.current = true;"),
  "Raw peer logout events may no longer force expiration without verification");

console.log("HOTFIX #1026 : transitions Console/Account, MFA, reconnexion et 4 états inter-onglets validés.");
