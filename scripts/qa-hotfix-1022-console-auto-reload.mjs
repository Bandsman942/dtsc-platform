import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(name, "utf8").replace(/\r\n/g, "\n");
const resume = read("components/pwa/app-resume-sync.tsx");
const shell = read("components/layout/app-shell.tsx");
const guard = read("components/auth/session-timeout-guard.tsx");
const expiredNavigation = read("lib/client/session-expired-navigation.ts");
const diagnostics = read("lib/client/refresh-diagnostics.ts");
const expiredPage = read("app/session-expired/page.tsx");
const expiredCard = read("components/auth/session-expired-card.tsx");
const middleware = read("middleware.ts");
const pushQa = read("scripts/qa-session-background-push-checks.mjs");
const pwaRegister = read("components/pwa/pwa-register.tsx");

function check(label, condition) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

check("shell transmet le compteur serveur initial au sync", shell.includes("initialUnreadCount={unreadNotifications}"));
check("resume ne fait qu'un refresh RSC conditionné au changement réel", (resume.match(/router\.refresh\(\)/g) || []).length === 1 &&
  resume.includes("if (unreadCount !== unreadCountRef.current)") &&
  resume.includes("unreadCountRef.current = initialUnreadCount"));
check("focus, pageshow, online et visible partagent un throttle sans polling", resume.includes("RESUME_MIN_INTERVAL_MS = 15_000") &&
  resume.includes('sync("resume")') &&
  !resume.includes("setInterval(") &&
  resume.includes("if (syncPromiseRef.current) return syncPromiseRef.current"));
check("push garde un sync borné indépendant", resume.includes("PUSH_MIN_INTERVAL_MS = 1_000") &&
  resume.includes('sync("push")'));
check("service worker n'impose jamais de rechargement de document", !pwaRegister.includes("window.location.reload()") &&
  !pwaRegister.includes('addEventListener("controllerchange"') &&
  pwaRegister.includes("SW_UPDATE_MIN_INTERVAL_MS = 60_000") &&
  pwaRegister.includes("updateInFlight"));
check("réponse invalide et erreurs réseau ne rafraîchissent pas la page", resume.includes("Number.isFinite(body.unreadCount)") &&
  resume.includes("if (!response.ok) return") &&
  resume.includes("catch {"));
check("401 ne provoque aucune paire push + refresh", resume.includes('navigateToSessionExpired(router, "resume-session-expired")') &&
  !resume.includes('router.push("/session-expired")') &&
  !guard.includes("router.refresh()"));
check("heartbeat et multi-onglets dédupliquent la navigation expirée", guard.includes('navigateToSessionExpired(router, "heartbeat-session-expired")') &&
  guard.includes('navigateToSessionExpired(router, "session-sync-logout")') &&
  guard.includes("if (expiredRef.current) return;") &&
  guard.includes("RESUME_HEARTBEAT_MIN_INTERVAL_MS = 3_000"));
check("helper inter-composants ne navigue qu'une fois", expiredNavigation.includes("let navigationPending = false") &&
  expiredNavigation.includes("if (navigationPending") &&
  expiredNavigation.includes('router.replace("/session-expired")'));
check("reconnexion rétablit la bonne destination produit", expiredPage.includes('hostType === "console"') &&
  expiredPage.includes('getConsoleUrl("/admin")') &&
  expiredPage.includes('hostType === "support"') &&
  expiredPage.includes('getSupportUrl("/support")') &&
  expiredPage.includes("getSignInUrl(returnUrl)"));
check("compte respecte reason=session-expired malgré le cookie signé", (middleware.match(/request\.nextUrl\.searchParams\.get\("reason"\) !== "session-expired"/g) || []).length === 2);
check("la route session-expired reste hors matcher, sans nouvelle redirection", !middleware.slice(middleware.indexOf("export const config =")).includes('"/session-expired"'));
check("le compte à rebours déclenche une seule navigation", expiredCard.includes("navigationStartedRef.current = true") &&
  expiredCard.includes("window.location.replace(reconnectUrl)") &&
  !expiredCard.includes("router.refresh()"));
check("diagnostics uniquement opt-in, bornés et sans valeurs métier", diagnostics.includes('storage.getItem(ENABLED_KEY) !== "1"') &&
  diagnostics.includes("MAX_EVENTS = 40") &&
  diagnostics.includes("ALLOWED_EVENTS.has(entry.event)") &&
  !diagnostics.includes("document.cookie") &&
  !diagnostics.includes("window.location") &&
  !diagnostics.includes("userId") &&
  !diagnostics.includes("email:"));
check("la QA #1022 est exécutée par la régression sessions", pushQa.includes('qa-hotfix-1022-console-auto-reload.mjs'));

console.log("\nQA HOTFIX #1022 : 15 contrôles de non-régression passent.");
