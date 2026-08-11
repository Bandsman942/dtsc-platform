import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const context = read("lib/ai/context-engine.ts");
const sessionContext = read("lib/ai/session-context.ts");
const commercialContext = read("lib/billing/commercial-context.ts");
const usageLimits = read("lib/billing/ai-usage-limits.ts");
const cag = read("lib/ai/cag-registry.ts");
const interfaceContext = read("lib/ai/application-interface-context.ts");
const orchestrator = read("lib/ai/orchestrator.ts");
const chatRoute = read("app/api/chat/v2/route.ts");
const agentRoute = read("app/api/chat/agent/route.ts");
const collaboratorsAgent = read("app/api/collaborators/ai/agent/route.ts");
const collaboratorsCompose = read("app/api/collaborators/ai/compose/route.ts");
const chatPage = read("app/chat/page.tsx");
const chatWorkspace = read("components/chat/chat-workspace-v2.tsx");

expect(context.includes("organizationId"), "Context engine must be organization-aware");
expect(context.includes("listNavigableEnterpriseModules"), "Context engine must derive readable client modules server-side");
expect(context.includes("resolveEnterpriseModuleAccess"), "Requested module context must be revalidated");
expect(context.includes("MEDICAL_RECORDS"), "Health clinical access must be explicitly checked");
expect(context.includes("CONFIDENTIAL"), "Organization-scoped turns must be confidential by default");
expect(context.includes("contextVersion"), "Context engine must produce a version hash");

expect(sessionContext.includes('activeContext === "DTSC_INTERNAL"'), "AI session context must prioritize DTSC_INTERNAL before organization-id inference");
expect(sessionContext.includes('activeContext === "ORGANIZATION"'), "AI session context must still recognize client organization sessions");
expect(context.includes("DTSC_INTERNAL_ORGANIZATION_ID"), "Context engine must bind DTSC_INTERNAL to the stable internal tenant id");
expect(context.includes('organizationType: "DTSC_INTERNAL"'), "DTSC_INTERNAL context must require the internal organization type");
expect(context.includes('organizationType: "CLIENT"'), "Client organization context must remain restricted to CLIENT tenants");
expect(context.includes('contextCode !== "DTSC_INTERNAL"'), "Internal tenant must fail closed when presented under a non-internal context");
expect(context.includes('contextCode: "DTSC_INTERNAL"'), "Context engine must return the canonical DTSC_INTERNAL context");
expect(context.includes('planCode: "ENTERPRISE"'), "DTSC_INTERNAL execution context must keep Enterprise model entitlement");

expect(commercialContext.includes("resolveOrganizationCommercialContext"), "Commercial context must expose one organization resolver");
expect(commercialContext.includes("ORGANIZATION_LEGACY_MAPPED"), "Historical organization offers must have an explicit compatibility source");
expect(commercialContext.includes("ORGANIZATION_BASELINE"), "Missing organization offers must have a fail-closed baseline source");
expect(commercialContext.includes("org-premium"), "Legacy premium organization subscriptions must map to the organization catalog");
expect(commercialContext.includes('organizationType: "CLIENT"'), "Commercial organization resolver must stay client-tenant scoped");

expect(usageLimits.includes("DTSC_INTERNAL_USER_LIMITS"), "Internal AI usage limits must have an explicit canonical source");
expect(usageLimits.includes("dailyMessageLimit: internalUser?.dailyMessageLimit"), "Internal message limits must honor console-managed user values");
expect(usageLimits.includes("dailyTokenLimit: internalUser?.dailyTokenLimit"), "Internal token limits must honor console-managed user values");
expect(usageLimits.includes('planCode: "ENTERPRISE"'), "Internal usage limits must preserve Enterprise entitlement");
expect(usageLimits.includes("resolveOrganizationCommercialContext"), "Organization AI limits must use the commercial context resolver");
expect(usageLimits.includes("resolvePersonalCommercialContext"), "Personal AI limits must use the commercial context resolver");
expect(usageLimits.includes('source: "ORGANIZATION_BASELINE"'), "Organization AI without a valid offer must fail closed instead of using personal quotas");
expect(usageLimits.includes("dailyMessageLimit: 0"), "Organization baseline must not borrow a personal message quota");
expect(usageLimits.includes("dailyTokenLimit: 0"), "Organization baseline must not borrow a personal token quota");
expect(!usageLimits.includes("prisma.subscription.findFirst"), "AI usage resolver must not implement a second direct personal subscription query");

expect(cag.includes("getCanonicalAiUsageLimits"), "CAG must read the same canonical commercial projection as AI limits");
expect(cag.includes("Offre commerciale:"), "CAG must name the commercial offer explicitly");
expect(cag.includes("Niveau de capacité:"), "CAG must distinguish capability tier from the offer name");
expect(!cag.includes("Plan: ${context.planCode}"), "CAG must not expose a capability code as an ambiguous commercial plan");

expect(interfaceContext.includes("MODULE_NAVIGATION_GROUPS"), "AI interface context must derive navigation labels from the current navigation registry");
expect(interfaceContext.includes("STANDARD_MODULE_REGISTRY"), "AI interface context must derive its product vocabulary from the current standard module registry");
expect(interfaceContext.includes("isStandardModuleNavigable"), "AI interface context must exclude hidden or non-navigable module entries");
expect(interfaceContext.includes("charger les espaces disponibles"), "AI interface context must know the explicit workspace loading flow");
expect(interfaceContext.includes("avant Déconnexion"), "AI interface context must know the mobile workspace selector placement");
expect(interfaceContext.includes("Administration DTSC utilise désormais le même type d’en-tête que Activités DTSC"), "AI interface context must know the modern Administration DTSC header");
expect(interfaceContext.includes("libellés visibles à l’écran"), "AI interface guidance must favor user-facing product language");
expect(orchestrator.includes("buildApplicationInterfaceContext"), "AI orchestrator must inject the canonical application interface context centrally");
expect(orchestrator.includes("request.assistantCode"), "Application interface context must be scoped to assistant executions");
expect(orchestrator.includes("instructions: [request.instructions, interfaceContext]"), "Assistant instructions must include the current application interface context");

for (const [label, source] of [
  ["chat v2", chatRoute],
  ["chat agent", agentRoute],
  ["collaborator agent", collaboratorsAgent],
  ["collaborator compose", collaboratorsCompose],
]) {
  expect(source.includes("resolveAiSessionContext(session)"), `${label} must derive AI context from the authenticated session`);
  expect(source.includes("AiExecutionContextError"), `${label} must handle Context Engine denials explicitly`);
  expect(source.includes("prepareAiTurn"), `${label} must use the canonical assistant runtime`);
}

expect(chatPage.includes("resolveAiSessionContext(session)"), "Chat page model catalog must use the same session context resolver as runtime routes");
expect(chatWorkspace.includes("body?.reasonCode || body?.error || body?.code"), "Chat UI must consume structured AI reason codes instead of a single generic error path");
expect(chatWorkspace.includes('reasonCode === "DAILY_LIMIT_REACHED"'), "Chat UI must distinguish daily usage limits");
expect(chatWorkspace.includes('reasonCode === "RATE_LIMITED"'), "Chat UI must distinguish rate limiting");
expect(chatWorkspace.includes('reasonCode === "MODEL_UNAVAILABLE"'), "Chat UI must distinguish unavailable models");
expect(chatWorkspace.includes('reasonCode === "PROVIDER_UNAVAILABLE"'), "Chat UI must distinguish provider unavailability");
expect(chatWorkspace.includes("ORGANIZATION_ACCESS_DENIED"), "Chat UI must provide a safe context-access error state");

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-context-engine: OK");
