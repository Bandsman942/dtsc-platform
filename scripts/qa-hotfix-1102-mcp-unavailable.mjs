import assert from "node:assert/strict";
import fs from "node:fs";
import { detectPublicChatMcpIntent, detectPublicAgentSearchIntent } from "../lib/ai/mcp/public-knowledge-chat-intent.ts";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

const asks = [
  ["Quelles date et heure est-il maintenant à Kinshasa ?", "MCP_TIME_GET_CURRENT_TIME", "Africa/Kinshasa"],
  ["Quelle heure est-il à Kinshasa ?", "MCP_TIME_GET_CURRENT_TIME", "Africa/Kinshasa"],
  ["What time is it right now in Tokyo?", "MCP_TIME_GET_CURRENT_TIME", "Asia/Tokyo"],
  ["Quelle heure est-il maintenant à Paris ?", "MCP_TIME_GET_CURRENT_TIME", "Europe/Paris"],
  ["What is the current time in New York?", "MCP_TIME_GET_CURRENT_TIME", "America/New_York"],
];
for (const [prompt, code, zone] of asks) {
  const value = detectPublicChatMcpIntent(prompt);
  assert.equal(value?.toolCode, code, "No tool for current-time question: " + prompt);
  assert.equal(value?.args.timezone, zone, "Wrong timezone for: " + prompt);
}
assert.equal(detectPublicChatMcpIntent("Quelle heure est-il maintenant à Brazzaville ?"), null, "Never guess the timezone for unknown cities.");
assert.equal(detectPublicChatMcpIntent("Explique la notion de fuseau horaire"), null, "Do not hijack general conversation.");
assert.equal(detectPublicChatMcpIntent("Quelle est la date de naissance de Marie Curie ?"), null, "Do not hijack historical queries.");
assert.equal(detectPublicChatMcpIntent("cherche sur le web documentation Model Context Protocol")?.toolCode, "MCP_BRAVE_SEARCH_WEB");
assert.equal(detectPublicChatMcpIntent("Recherche web la documentation MCP")?.toolCode, "MCP_BRAVE_SEARCH_WEB");
assert.equal(detectPublicChatMcpIntent("Cherche les dernières actualités sur Next.js")?.toolCode, "MCP_BRAVE_SEARCH_NEWS");
assert.equal(detectPublicChatMcpIntent("What is the latest news about Vercel?")?.toolCode, "MCP_BRAVE_SEARCH_NEWS");
assert.equal(detectPublicChatMcpIntent("Quels sont les prix des abonnements DTSC ?"), null, "No unrelated MCP call");
assert.equal(detectPublicAgentSearchIntent("Cherche les dernières actualités sur Next.js")?.toolCode, "MCP_BRAVE_SEARCH_NEWS", "Explicit public news available to enterprise agents.");
assert.equal(detectPublicAgentSearchIntent("Recherche web la documentation MCP")?.toolCode, "MCP_BRAVE_SEARCH_WEB", "Explicit public Web search available to enterprise agents.");
assert.equal(detectPublicAgentSearchIntent("Cherche sur le web notre entreprise SHOP BCN"), null, "Enterprise identifiers cannot be sent to Brave.");
assert.equal(detectPublicAgentSearchIntent("Cherche sur le web dossier patient 123456"), null, "Clinical data must remain internal.");
assert.equal(detectPublicAgentSearchIntent("Cherche sur le web facture 123456"), null, "Finance data must remain internal.");
assert.equal(detectPublicChatMcpIntent("Recherche sur le web mon mot de passe"), null, "Never send a password to Brave");
assert.equal(detectPublicChatMcpIntent("cherche sur le web secret@test.example"), null, "Never send an email address to Brave");
assert.equal(detectPublicChatMcpIntent("cherche sur le web mon compte bancaire"), null, "Never send private bank details to Brave");

const handlerTime = read("lib/ai/mcp/public-knowledge-time-handler.ts");
const handlerBrave = read("lib/ai/mcp/public-knowledge-brave-handler.ts");
const routeTime = read("app/api/internal/mcp/time/route.ts");
const routeBrave = read("app/api/internal/mcp/brave/route.ts");
const transport = read("lib/ai/mcp/transport.ts");
const probe = read("lib/ai/mcp/public-knowledge-probe.ts");
const consoleSource = read("lib/console/console-ai-mcp.ts");
const executor = read("lib/ai/mcp/public-knowledge-executor.ts");
const standardChat = read("app/api/chat/v2/route.ts");
const standardTool = read("lib/ai/mcp/public-knowledge-chat.ts");
const agent = read("lib/ai/agent/runtime.ts");
const enterpriseAgent = read("app/api/enterprise/ai/agent/route.ts");
const personalAgent = read("app/api/chat/agent/route.ts");
const config = read("lib/ai/mcp/public-knowledge-config.ts");

for (const [name,handler,route,token] of [
  ["Time",handlerTime,routeTime,"MCP_PUBLIC_TIME_TOKEN"],
  ["Brave",handlerBrave,routeBrave,"MCP_PUBLIC_BRAVE_TOKEN"],
]) {
  assert.ok(handler.includes("createMcpHandler"), name + ": live handler is real MCP SDK");
  assert.ok(handler.includes("withPublicMcpBearer"), name + ": must keep bearer even in-process");
  assert.ok(handler.includes(token), name + ": isolated secret is required");
  assert.ok(route.includes(name === "Time" ? "handlePublicTimeMcp" : "handlePublicBraveMcp"), name + ": HTTP and in-process share handler");
  assert.ok(route.includes("export const POST"), name + ": external certification HTTP kept");
}
assert.ok(transport.includes("dispatchMcpRequest(input.server, endpoint.url"), "Gateway must dispatch through the local/remote transport selector.");
assert.ok(transport.includes('server.code === "PUBLIC_TIME"') && transport.includes('server.code === "PUBLIC_BRAVE"'));
assert.ok(transport.includes('server.endpoint === `https://app.dtsc-platform.com${expected.path}`'), "Only canonical server endpoint may dispatch locally.");
assert.ok(transport.includes('server.authMode === "BEARER_ENV"') && transport.includes('server.allowedHosts.length === 1'), "Guard against arbitrary local dispatch.");
assert.ok(transport.includes('return fetch(endpoint, init)'), "All external MCP must retain network transport.");
assert.ok(probe.includes("callMcpJsonRpc"), "Live Console probe must use genuine tools/list.");
assert.ok(consoleSource.includes("liveServers[server.code]"), "Console certification requires live discovery.");
assert.ok(executor.includes("callMcpJsonRpc"), "Agent and standard chat use canonical MCP transport.");
assert.ok(executor.includes('if (spec.server !== "time") assertPublicOnly(context)'), "Only local schema-constrained Time may execute in confidential contexts; external Brave/Fetch must remain PUBLIC_ONLY.");
assert.ok(executor.includes('["CONFIDENTIAL", "RESTRICTED", "HEALTH_SENSITIVE"'), "Brave must still refuse confidential/health/financial content.");
assert.ok(agent.includes('"MCP_TIME_GET_CURRENT_TIME"') && agent.includes('"MCP_BRAVE_SEARCH_NEWS"'), "Agent mode remains tool-enabled.");
assert.ok(agent.includes("detectPublicAgentSearchIntent(input.explicitPublicUserRequest") && agent.includes("isolatedPublicBrave") && agent.includes("explicitPublicSearch.args"), "Confidential agents must override model-proposed Brave arguments with original user-only public request.");
assert.ok(agent.includes('dataClassifications: ["PUBLIC" as const]'), "The execution classification may be narrowed only for a fully sanitized public query.");
assert.ok(enterpriseAgent.includes("explicitPublicUserRequest: data.content") && personalAgent.includes("explicitPublicUserRequest: data.content"), "Only authenticated user raw text may authorize public Brave search.");
assert.ok(standardChat.includes("getStandardChatPublicMcpAnswer") && standardChat.includes('action: "chat_v2_public_mcp"'), "Standard chat must actually call the audited gateway.");
assert.ok(standardChat.includes('X-AI-Execution": "CANONICAL_TOOL"'), "Maintain canonical chat client streaming contract.");
assert.ok(standardTool.includes("executeAiTool(") && standardTool.includes('organizationId: null') && standardTool.includes('assistantCode: "DTSC_GENERAL"'), "No company data in public chat tools.");
assert.ok(standardTool.includes('activeContext: "GLOBAL_CLIENT"') && standardTool.includes('activeOrganizationId: null'), "Personal chat MCP calls must not inherit an unrelated organization workspace.");
assert.ok(standardTool.includes("untrusted !== true") && standardTool.includes("new URL(hit.url)"), "Web sources must remain untrusted and URL-validated.");
assert.ok(standardTool.includes("detectPublicAgentSearchIntent(input.content)"), "Standard chat must apply the strict enterprise-grade Brave privacy gate.");
assert.ok(standardTool.includes("source") || standardTool.includes("Source"), "Results must be attributable.");
assert.ok(config.includes('process.env.MCP_PUBLIC_FETCH_CERTIFIED === "true"'), "Fly Fetch remains independently disabled.");

const pkg = JSON.parse(read("package.json"));
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "A release must keep a valid SemVer version");
const [major, minor, patch] = pkg.version.split(".").map(Number);
assert.ok(major > 1 || (major === 1 && (minor > 8 || minor === 8 && patch >= 2)), "The MCP #1102 fix requires release v1.8.2 or newer");
assert.equal(pkg.scripts["qa:hotfix-1102"], "node --experimental-strip-types scripts/qa-hotfix-1102-mcp-unavailable.mjs");
assert.ok(pkg.scripts["qa:regression"].includes("qa-hotfix-1102-mcp-unavailable.mjs"));

console.log("PASS #1102: standard-chat Time/Kinshasa + Brave Web/news intents, sensitive exclusion, audited Tool Gateway, in-process authenticated MCP SDK transport, external routes retained and Console live probe.");
