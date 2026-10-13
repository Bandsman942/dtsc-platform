import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (path) => readFileSync(path, "utf8");
const page = load("app/admin/console-page.tsx");
const subsection = load("components/admin/console-subsection.tsx");
const fr = JSON.parse(load("locales/fr.json")).console.detailSections;
const en = JSON.parse(load("locales/en.json")).console.detailSections;
const routes = load("lib/console/console-routes.ts");

assert.match(page, /<ConsoleWorkspaceShell/);
assert.match(page, /getConsoleAccessDecision/);
assert.match(page, /canAccessAdminSection/);
assert.doesNotMatch(page, /<Accordion|<AccordionItem/, "legacy wrappers must not surround Console work areas");
assert.match(page, /<ConsoleSubsection id="platform-indicators"/);
for (const id of ["ai-models", "ai-connectors", "ai-safety", "users-create", "users-newsletter", "users-list", "platform-preferences", "platform-flags", "billing-plans", "billing-manual", "billing-subscriptions", "security-incidents", "security-traces"]) {
  assert.ok(page.includes(`id="${id}"`), `Missing workspace subsection ${id}`);
}
for (const lib of ["ConsoleAiConfigurationPanel", "ConsoleAiPolicyManager", "ConsoleAiMcpPanel", "ConsoleAiKnowledgeSecurityPanel", "ConsoleAiAlertPanel", "AdminSettingsPanel", "FeatureFlagManager", "PublicPublicationsManager", "CreateUserForm", "ClientOrganizationsPanel", "BillingPlanManager", "ManualSubscriptionPaymentsAdmin", "AdminBillingSubscriptions", "TicketBoard", "AdminAuditTables", "PlatformIncidentManager"]) {
  assert.match(page, new RegExp(`<${lib}\\b`), `Functional panel lost: ${lib}`);
}
assert.match(subsection, /scroll-mt-24/);
assert.match(subsection, /<Link key=\{item.id\}/);
assert.match(subsection, /aria-label=\{label\}/);
assert.match(page, /<ModuleMetrics label=\{translate\(locale, "console.detailSections.supportIndicators"\)\}/);
assert.match(subsection, /<section id=\{id\}/);
const ids = [...page.matchAll(/<ConsoleSubsection id="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, "subsection anchors must be unique per rendering branch");
for (const [name, dict] of [["FR", fr], ["EN", en]]) {
  for (const key of ["platformIndicators", "aiModels", "aiConnectors", "aiSafety", "createUser", "newsletter", "userList", "platformPreferences", "platformFlags", "billingPlans", "billingManual", "billingSubscriptions", "incidents", "auditLogs"]) {
    assert.ok(typeof dict[key] === "string" && dict[key].trim(), `${name} missing ${key}`);
  }
}
assert.match(routes, /"module-maturity"/, "maturity remains separate");
console.log("DTSC Console SaaS workspace rendering contract: PASS");
