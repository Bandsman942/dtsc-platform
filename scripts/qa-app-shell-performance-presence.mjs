import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};

const appShell = read("components/layout/app-shell.tsx");
const perf = read("lib/app-shell-performance.ts");
const mobileShell = read("components/dtsc/mobile-shell.tsx");
const lease = read("components/dtsc/use-collaboration-presence-lease.ts");
const presenceService = read("lib/collaboration-presence-sessions.ts");
const presenceRoute = read("app/api/collaborators/presence/route.ts");
const foregroundRoute = read("app/api/notifications/foreground/route.ts");
const foregroundBridge = read("components/pwa/pwa-notification-bridge.tsx");

const aggregateBudget = Number(perf.match(/APP_SHELL_GLOBAL_AGGREGATE_BUDGET\s*=\s*(\d+)/)?.[1]);
const aggregateCalls = [...appShell.matchAll(/performanceRecorder\.timed\(/g)].length;
ok(aggregateBudget === 10, `AppShell aggregate budget must remain 10, got ${aggregateBudget || "missing"}.`);
ok(aggregateCalls <= aggregateBudget, `AppShell executes ${aggregateCalls} measured global aggregate tasks, budget is ${aggregateBudget}.`);
ok(appShell.includes("createAppShellPerformanceRecorder"), "AppShell must instrument global aggregate latency.");
ok(appShell.includes("performanceRecorder.finish({ organizationContext })"), "AppShell must emit a bounded aggregate summary when instrumentation is enabled.");
ok(!appShell.includes("prisma.notification.findMany"), "Foreground notification payload must not block AppShell render.");
ok(appShell.includes("<PwaNotificationBridge enabled={Boolean(user.pushNotificationsEnabled)} />"), "AppShell must delegate foreground notification payload loading to the client bridge.");
ok(perf.includes('process.env.DTSC_APP_SHELL_PERF_LOG === "true"'), "Shell performance logs must be explicit opt-in.");
ok(!perf.includes("userId") && !perf.includes("organizationId"), "Shell performance instrumentation must not log user or tenant identifiers.");

ok(mobileShell.includes("useCollaborationPresenceLease();"), "Mobile shell must use the shared adaptive presence lease.");
ok(!mobileShell.includes("setInterval(markOnline, 15000)"), "Legacy 15 second presence polling must be removed from MobileShell.");

const heartbeatMs = Number(lease.match(/PRESENCE_HEARTBEAT_MS\s*=\s*([\d_]+)/)?.[1]?.replaceAll("_", ""));
const staleMs = Number(presenceService.match(/COLLABORATION_PRESENCE_STALE_MS\s*=\s*([\d_]+)/)?.[1]?.replaceAll("_", ""));
ok(heartbeatMs === 45_000, `Visible presence heartbeat budget must be 45s, got ${heartbeatMs || "missing"}.`);
ok(staleMs === 60_000, `Presence stale lease contract unexpectedly changed from 60s, got ${staleMs || "missing"}.`);
ok(heartbeatMs > 15_000 && heartbeatMs < staleMs, "Presence heartbeat must be less frequent than 15s while remaining inside the server stale lease.");
ok(lease.includes("window.setTimeout"), "Presence refresh must use an adaptive timeout instead of a fixed interval.");
ok(!lease.includes("setInterval"), "Presence lease must not use a fixed interval.");
for (const token of [
  "sessionStorage",
  "clientSessionId",
  'window.addEventListener("online"',
  'window.addEventListener("offline"',
  'window.addEventListener("pagehide"',
  'document.addEventListener("visibilitychange"',
  'document.visibilityState === "visible"',
]) {
  ok(lease.includes(token), `Adaptive presence lease missing ${token}.`);
}
ok(presenceRoute.includes("clientSessionId"), "Presence API must preserve per-client session semantics.");
ok(presenceRoute.includes("isSameOriginRequest"), "Presence writes must preserve same-origin protection.");

ok(foregroundRoute.includes("getSession()"), "Deferred foreground notification API must authenticate the request.");
ok(foregroundRoute.includes("getVisibleNotificationWhereForSession(session)"), "Deferred notification API must preserve visibility/tenant scoping.");
ok(foregroundRoute.includes("take: 5"), "Deferred notification payload must remain bounded.");
const subscriptionCheck = foregroundBridge.indexOf("getSubscription()");
const notificationFetch = foregroundBridge.indexOf("getForegroundNotifications(controller.signal)");
ok(subscriptionCheck >= 0 && notificationFetch > subscriptionCheck, "Foreground notification DB fetch must happen only after checking for an active Push subscription.");
ok(foregroundBridge.includes('cache: "no-store"'), "Foreground notification payload must stay fresh and user scoped.");

if (failures.length) {
  console.error(`AppShell performance/presence QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

const legacyRequestsPerHour = 60 * 60 * 1000 / 15_000;
const visibleRequestsPerHour = 60 * 60 * 1000 / heartbeatMs;
console.log(
  `AppShell performance/presence QA passed: global aggregate budget ${aggregateCalls}/${aggregateBudget}; foreground notification payload deferred; visible presence heartbeat reduced from ${legacyRequestsPerHour}/h to at most ${visibleRequestsPerHour}/h and suspended while hidden/offline.`,
);
