import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

function walkFiles(directory, suffix = ".tsx") {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(relative, suffix) : entry.name.endsWith(suffix) ? [relative] : [];
  });
}

// 1. Mes Collaborateurs: multiline text must remain visually contained.
const voiceComposer = read("components/chat/VoiceConversationComposer.tsx");
const simpleComposer = read("components/chat/ConversationComposer.tsx");
const mobileCss = read("app/mobile-stability.css");
expect(voiceComposer.includes("MAX_COMPOSER_HEIGHT"), "Voice collaborator composer must keep an explicit growth ceiling");
expect(voiceComposer.includes('textarea.style.height = "auto"'), "Voice collaborator composer must recalculate height from content");
expect(voiceComposer.includes("event.ctrlKey || event.metaKey"), "Plain Enter must remain a newline while Ctrl/Cmd+Enter may send");
expect(simpleComposer.includes("COMPOSER_MAX_HEIGHT_PX"), "Shared conversation composer must keep an explicit growth ceiling");
expect(simpleComposer.includes("[scrollbar-width:none]"), "Shared conversation composer must hide its native scrollbar");
expect(mobileCss.includes("textarea.max-h-44"), "Immersive collaborator composer must have the mobile containment contract");
expect(mobileCss.includes("scrollbar-width: none"), "Immersive collaborator composer must hide its native vertical scrollbar");
expect(mobileCss.includes("overflow-wrap: anywhere"), "Immersive collaborator composer must contain long unbroken text");

// 2. Shop: one canonical setup readiness and actionable deep links.
const onboarding = read("lib/enterprise/retail/self-service-onboarding.ts");
const commercialDashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
const readinessLinks = read("lib/enterprise/retail/readiness-deep-links.ts");
const readinessUi = read("components/enterprise/professional/retail-global-readiness.tsx");
expect(onboarding.includes("getCanonicalRetailReadiness"), "Shop must expose one canonical readiness resolver");
expect(onboarding.includes("getRetailReadinessDeepLink"), "Canonical Shop readiness items must include their configuration destination");
expect(onboarding.includes("catalogCount > 0 &&"), "Inventory readiness must not be complete before the catalog exists");
expect(commercialDashboard.includes("getCanonicalRetailReadiness"), "Commercial Shop dashboard must consume canonical onboarding readiness");
expect(!commercialDashboard.includes("const readiness = ["), "Commercial Shop dashboard must not rebuild a competing base readiness checklist");
for (const code of ["COUNTRY_PACK", "FUNCTIONAL_CURRENCY", "SITE", "WAREHOUSE", "CASH_ACCOUNT", "CATALOG", "INVENTORY_LINKS", "TEAM", "ACCOUNTING", "RETAIL_CONFIGURATION"]) {
  expect(readinessLinks.includes(`${code}:`), `Shop readiness deep-link catalog must cover ${code}`);
}
expect(readinessUi.includes('id="shop-country-configuration"'), "Country configuration must expose an exact in-page destination");
expect(readinessUi.includes('id="shop-point-of-sale-configuration"'), "POS configuration must expose an exact in-page destination");
expect(readinessUi.includes("item.deepLink"), "Every first-sale checklist item must render its canonical deep link");
expect(readinessUi.includes("getRetailCountryCapabilityDeepLink"), "Country capability cards must be directly actionable");
expect(mobileCss.includes("details > summary + .flex.overflow-x-auto"), "ERP continuation links must be bounded on narrow screens");
expect(mobileCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "ERP continuation links must use a responsive bounded grid on mobile");

// 3. Sensitive actions: every component uses the explicit async DTSC Dialog API.
// Native window.confirm is forbidden; the provider must never monkey-patch the browser API
// or replay a detached DOM click.
const confirmationContract = read("lib/client-confirmation.ts");
const confirmationProvider = read("components/ui/sensitive-action-confirmation-provider.tsx");
const rootLayout = read("app/layout.tsx");
expect(confirmationContract.includes("confirmSensitiveAction"), "Sensitive action confirmation API must be reusable");
expect(confirmationContract.includes('return Promise.resolve({ confirmed: false })'), "Sensitive action confirmation must fail closed without a browser UI");
expect(confirmationProvider.includes("<Dialog"), "Explicit async sensitive actions must use the DTSC dialog component");
expect(confirmationProvider.includes("DTSC_CONFIRMATION_EVENT"), "DTSC dialog provider must listen to the canonical async confirmation event");
expect(confirmationProvider.includes("window.addEventListener"), "DTSC dialog provider must subscribe to explicit confirmation requests");
for (const forbidden of ["window.confirm =", "origin.click()", "approvedReplay", "replaying = true", "window.dispatchEvent"]) {
  expect(!confirmationProvider.includes(forbidden), `Sensitive action provider must not emulate synchronous confirmation through a global bridge: ${forbidden}`);
}
expect(rootLayout.includes("SensitiveActionConfirmationProvider"), "Sensitive action confirmation provider must be mounted globally");

for (const file of walkFiles("components")) {
  const source = read(file);
  expect(!/\bwindow\.confirm\s*\(/.test(source), `Native browser confirmation is forbidden; use confirmSensitiveAction instead: ${file}`);
}
for (const file of [
  "components/calendar/internal-calendar/workspace.tsx",
  "components/collaborators/collaborators-conversation-workspace.tsx",
]) {
  const source = read(file);
  expect(source.includes("confirmSensitiveAction"), `${file} must use the explicit async DTSC confirmation contract`);
}
for (const file of [
  "components/admin/billing-reconciliation-control.tsx",
  "components/admin/admin-audit-tables.tsx",
  "components/admin/operational-sla-panel.tsx",
  "components/calendar/calendar-advanced-tools/panel.tsx",
  "components/enterprise/professional/retail-global-readiness.tsx",
]) {
  const source = read(file);
  expect(!/\bwindow\.confirm\s*\(/.test(source), `${file} must use the direct DTSC confirmation contract instead of browser confirm`);
  expect(source.includes("toast") || source.includes("useToastMessage"), `${file} must route mutation feedback through DTSC toasts`);
}

// 4. Background notification privacy: privacy-first, persisted and applied at send time.
const sessionPreferenceSchema = read("prisma/session-policy.prisma");
const notificationPrivacyMigration = read("prisma/migrations/20260811212500_push_notification_content_privacy/migration.sql");
const sessionPreference = read("lib/session-preference.ts");
const notificationPrivacyRoute = read("app/api/account/notification-privacy/route.ts");
const settings = read("components/settings/session-and-push-settings.tsx");
const pushPayload = read("lib/push/payload.ts");
const pushSender = read("lib/push/sender.ts");
expect(sessionPreferenceSchema.includes('pushNotificationContentMode String   @default("PRIVATE")'), "Push detail preference must default to PRIVATE");
expect(notificationPrivacyMigration.includes('ADD COLUMN "pushNotificationContentMode"'), "Push detail preference must use an additive migration");
expect(sessionPreference.includes('value === "DETAILED" ? "DETAILED" : "PRIVATE"'), "Unknown push preference values must fail closed to PRIVATE");
expect(notificationPrivacyRoute.includes("isSameOriginRequest"), "Notification privacy writes must be same-origin protected");
expect(notificationPrivacyRoute.includes("writeAuditLog"), "Notification privacy changes must be audited");
expect(settings.includes("Masquer le contenu"), "Settings must offer a private notification option");
expect(settings.includes("Afficher le détail"), "Settings must offer a detailed notification option");
expect(pushPayload.includes('contentMode === "DETAILED"'), "Push payload may show business details only in DETAILED mode");
expect(pushPayload.includes("NEUTRAL_BODY"), "Private push mode must retain a neutral system body");
expect(pushSender.includes("pushNotificationContentMode"), "Push dispatch must read the user's notification privacy preference");
expect(
  pushSender.includes("where: { id: notificationId }")
    && pushSender.includes("userId: true")
    && pushSender.includes("user: {")
    && pushSender.includes("webPushQueueOrganizationId(notification.organizationId) !== expectedQueueOrganizationId"),
  "Detailed push content must be loaded from the canonical notification and its owning user within the queued organization scope",
);

// 5. AI module citations: approved links only, server-side access revalidation.
const interfaceContext = read("lib/ai/application-interface-context.ts");
const modulesHub = read("app/modules/page.tsx");
expect(interfaceContext.includes("ENTERPRISE_MODULE_REGISTRY"), "AI interface context must know navigable ERP module labels");
expect(interfaceContext.includes("/modules?open="), "AI module citations must use the controlled module resolver");
expect(interfaceContext.includes("N’invente jamais de code module"), "AI must be instructed not to invent module routes");
expect(interfaceContext.includes("un lien n’est jamais une preuve d’accès"), "AI links must never be treated as access grants");
expect(modulesHub.includes("requestedModuleCode"), "Module hub must resolve AI module destinations explicitly");
expect(modulesHub.includes("getEnterpriseNavigationModules"), "ERP module deep links must be resolved from the user's authorized module navigation");
expect(modulesHub.includes("standardCodeAllowed"), "Standard module deep links must honor contextual availability");
expect(modulesHub.includes("Cet espace n’est pas accessible"), "Denied module links must show a clear user-facing access message");

if (failures.length) {
  console.error("Cross-app UX integrity hotfix QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("cross-app-ux-integrity-hotfix: OK");
