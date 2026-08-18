import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) {
    console.error(`Fichier introuvable: ${path}`);
    process.exit(1);
  }
  return fs.readFileSync(path, "utf8");
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-2B: ${message}`);
    process.exit(1);
  }
}

const inbox = read("lib/collaboration-call-event-inbox.ts");
const hotRoute = read("app/api/collaborators/calls/events/route.ts");
const toast = read("components/calls/global-call-toast.tsx");
const preferences = read("app/api/account/preferences/route.ts");
const collaborationCalls = read("lib/collaboration-calls.ts");
const regression = read("scripts/run-regression-qa-ci.mjs");
const producers = [
  "app/api/collaborators/groups/[id]/calls/route.ts",
  "app/api/collaborators/calls/[id]/join/route.ts",
  "app/api/collaborators/calls/[id]/leave/route.ts",
  "app/api/collaborators/calls/[id]/end/route.ts",
  "app/api/collaborators/calls/[id]/reject/route.ts",
  "app/api/collaborators/calls/[id]/events/route.ts",
  "app/api/collaborators/calls/[id]/participants/route.ts",
  "app/api/collaborators/meeting-links/[id]/join/route.ts",
];

expect(inbox.includes('createHash("sha256")'), "Redis call-event keys must hash authenticated user identifiers");
expect(inbox.includes('"RPUSH", key, serialized'), "Call events must be appended to a Redis inbox");
expect(inbox.includes('"LTRIM", key, -COLLABORATION_CALL_EVENT_INBOX_MAX_ITEMS, -1'), "Redis inbox must remain bounded");
expect(inbox.includes("COLLABORATION_CALL_EVENT_INBOX_TTL_SECONDS = 15 * 60"), "Redis inbox TTL changed unexpectedly");
expect(inbox.includes("COLLABORATION_CALL_EVENT_DB_RECONCILE_SECONDS = 5 * 60"), "DB reconciliation budget changed unexpectedly");
expect(inbox.includes("COLLABORATION_CALL_SETTINGS_TTL_SECONDS = 5 * 60"), "Call settings cache TTL changed unexpectedly");
expect(inbox.includes("collaborationGroupMember.findMany"), "Publication must derive recipients server-side from active group members");
expect(inbox.includes('status: "ACTIVE"'), "Publication must restrict Redis recipients to active memberships");

expect(hotRoute.includes("readCollaborationCallEventInbox"), "Global call-event GET must read Redis first");
expect(hotRoute.includes("claimCollaborationCallDbReconciliation"), "Global call-event GET must keep bounded durable reconciliation");
expect(!hotRoute.includes("touchUserPresence"), "Global call-event polling must not write user presence");
expect(hotRoute.includes("dbReconciled: shouldReadDatabase"), "Call-event hot path must expose reconciliation telemetry");

expect(toast.includes("CALL_EVENT_IDLE_POLL_MS = 12_000"), "Idle global call polling must remain slower than the legacy 6s cadence");
expect(toast.includes("CALL_EVENT_ACTIVE_POLL_MS = 5_000"), "Active event cadence must remain explicit");
expect(!toast.includes("setInterval"), "Global call polling must not regress to a permanent setInterval");
expect(toast.includes('document.visibilityState === "visible"'), "Hidden documents must not poll");
expect(toast.includes("navigator.onLine !== false"), "Offline clients must not poll");

expect(preferences.includes("invalidateCollaborationCallSettingsCache"), "Call settings cache must be invalidated after preference updates");
expect(collaborationCalls.includes("publishCollaborationCallEvent"), "Missed-call expiration must publish to the Redis inbox");
for (const path of producers) {
  expect(read(path).includes("publishCollaborationCallEvent"), `Producer ${path} must publish durable events to Redis after persistence`);
}
expect(regression.includes("qa-scale2b-call-event-inbox.mjs"), "SCALE-2B QA must be wired into Regression QA");

console.log("SCALE-2B Redis call-event inbox contract: OK");
