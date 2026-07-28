import { readFileSync } from "node:fs";

const source = readFileSync("components/auth/session-timeout-guard.tsx", "utf8").replace(/\r\n/g, "\n");
const failures = [];

function check(label, condition) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(label);
  console.error(`FAIL ${label}`);
}

check(
  "aucun heartbeat périodique ne renouvelle une page seulement visible",
  !source.includes("activeHeartbeatInterval") && !source.includes("SESSION_ACTIVE_HEARTBEAT_INTERVAL_MS")
);
check(
  "activité utilisateur reste le déclencheur du heartbeat throttlée",
  source.includes("const registerActivity") && source.includes("void heartbeat(false)") && source.includes("SESSION_HEARTBEAT_THROTTLE_MS")
);
check(
  "resume mobile revalide toujours côté serveur",
  source.includes('document.addEventListener("visibilitychange"') && source.includes('window.addEventListener("focus"') && source.includes('window.addEventListener("pageshow"') && source.includes("heartbeat(true)")
);
check(
  "timer une seconde reste limité au warning/expiration locale",
  source.includes("const countdownInterval") && source.includes("remainingMs") && source.includes("window.clearInterval(countdownInterval)")
);

if (failures.length) {
  console.error(`\n${failures.length} contrôle(s) idle renewal en échec.`);
  process.exit(1);
}

console.log("\nQA idle renewal: 4 contrôles passent.");
