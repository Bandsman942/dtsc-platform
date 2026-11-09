import assert from "node:assert/strict";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { assertPublicFetchUrl, isPublicIp } from "./mcp-public-stdio-security.mjs";

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const must = (source, expression, reason) => assert.match(source, expression, reason);
const label = read("lib/enterprise/accounting/narrative-i18n.ts");
const accountingUi = read("components/enterprise/professional/enterprise-finance-accounting-workspace.tsx");
const legacyAccounting = read("components/enterprise/professional/enterprise-accounting-workspace.tsx");
const financeHotfixAccounting = read("components/enterprise/professional/enterprise-finance-accounting-workspace-hotfix.tsx");
const consolePanel = read("components/admin/console-ai-mcp-panel.tsx");
const probeSource = read("lib/ai/mcp/public-knowledge-probe.ts");
const config = read("lib/ai/mcp/public-knowledge-config.ts");
const executor = read("lib/ai/mcp/public-knowledge-executor.ts");
const worker = read("scripts/mcp-public-stdio-bridge.mjs");
const certification = read("scripts/mcp-public-stdio-certify.mjs");
const httpCertification = read("scripts/mcp-vercel-http-certify.mjs");
const timeRoute = read("app/api/internal/mcp/time/route.ts");
const braveRoute = read("app/api/internal/mcp/brave/route.ts");
const braveApi = read("lib/ai/mcp/public-knowledge-brave.ts");
const registry = read("lib/ai/mcp/registry.ts");
const prompt = read("lib/ai/prompts.ts");
const assistantRegistry = read("lib/ai/assistant-registry.ts");
const agentRuntime = read("lib/ai/agent/runtime.ts");
const toolRegistry = read("lib/ai/tool-registry.ts");
const toolSchemas = read("lib/ai/tools/schemas.ts");
const toolExecutors = read("lib/ai/tools/executors/index.ts");
const consoleSource = read("lib/console/console-ai-mcp.ts");
const env = read("env.example");

for (const phrase of [
  "Settle receivable", "Apply customer advance", "ISSUE", "RECEIPT", "Supplier invoice",
  "Revenue", "Output tax", "Payroll", "Closing FX revaluation", "Year-end close",
  "Expense settlement", "Asset disposal", "Bank charge", "Cash variance",
]) assert.ok(label.includes(phrase), `Missing canonical accounting label: ${phrase}`);
must(label, /formatAccountingNarrative\(/, "Central narrative translation");
must(label, /Human-authored comments[\s\S]*preserved/, "Do not mutate custom labels");
must(accountingUi, /render: \(row\) => formatAccountingNarrative\(row\.description, locale\)/, "Journal entries display translated");
must(accountingUi, /formatAccountingNarrative\(row\.description \|\| row\.journalEntry\?\.description, locale\)/, "Ledger and journal detail translated");
must(accountingUi, /get: \(row\) => formatAccountingNarrative\(/, "Export descriptions translated");
for (const value of [
  "Retail POS sale", "Retail POS reversal", "Retail POS return", "Retail cashback expense",
  "Telco top-up", "Telco operator float", "Mobile Money deposit", "Mobile Money withdrawal",
  "Store credit refund", "Internal transfer", "Customer refund", "Transfer in", "Transfer out",
]) assert.ok(label.includes(value), `Retail/telco/Mobile Money accounting label missing: ${value}`);
must(legacyAccounting, /formatAccountingNarrative\(/, "Older accounting display localizes generated narratives");
must(financeHotfixAccounting, /formatAccountingNarrative\(/, "Hotfix accounting view localizes generated narratives");
must(consolePanel, /server\.reachable === null/, "Global MCP Console shows live reachability rather than static health claims");
must(probeSource, /probePublicMcpServers/, "Console probes three servers independently");
must(worker, /bridgeHealthy\(\)/, "A dead Fetch stdio process revokes bridge readiness");
// These examples assert REAL formatter behavior rather than relying only on
// source-level regex presence; historical manually authored labels are intact.
const { formatAccountingNarrative } = await import("data:text/javascript," + encodeURIComponent(stripTypeScriptTypes(label)));
for (const [source, fr, en] of [
  ["ISSUE cmw83foo", "Sortie de stock — article cmw83foo", "Inventory issue — item cmw83foo"],
  ["RECEIPT cmw83foo", "Entrée de stock — article cmw83foo", "Inventory receipt — item cmw83foo"],
  ["Settle receivable PAY-MW9A1KC3-6E441F", "Affectation d’un encaissement à une créance client — paiement PAY-MW9A1KC3-6E441F", "Customer receivable settlement — payment PAY-MW9A1KC3-6E441F"],
  ["Apply customer advance PAY-MW9A1KC3-6E441F", "Imputation d’une avance client — paiement PAY-MW9A1KC3-6E441F", "Customer advance applied — payment PAY-MW9A1KC3-6E441F"],
  ["Retail POS sale POS-998", "Vente au point de vente — POS-998", "Retail point-of-sale transaction — POS-998"],
  ["Retail COGS reversal item99", "Annulation du coût des marchandises vendues — article item99", "Retail cost-of-goods-sold reversal — item item99"],
  ["Mobile Money deposit MM-132", "Dépôt Mobile Money — MM-132", "Mobile Money deposit — MM-132"],
  ["Telco operator float TOPUP-3", "Consommation du solde chez l’opérateur télécom — TOPUP-3", "Telecom operator float consumption — TOPUP-3"],
  ["Internal transfer TR-49", "Virement interne entre comptes financiers — TR-49", "Internal transfer between financial accounts — TR-49"],
  ["Bank charge", "Frais bancaires", "Bank charge"],
]) {
  assert.equal(formatAccountingNarrative(source, "fr"), fr, `Unexpected French accounting label for ${source}`);
  assert.equal(formatAccountingNarrative(source, "en"), en, `Unexpected English accounting label for ${source}`);
}
const manual = "Versement à un fournisseur selon contrat n°003";
assert.equal(formatAccountingNarrative(manual, "fr"), manual);
assert.equal(formatAccountingNarrative(manual, "en"), manual);


for (const line of [
  '"mcp-server-fetch"', '"PUBLIC_TIME"', '"PUBLIC_FETCH"', '"PUBLIC_BRAVE"',
  '"brave_web_search"', '"brave_news_search"', '"get_current_time"', '"convert_time"',
  '"fetch"', 'MCP_BRAVE_SEARCH_NEWS', 'MCP_TIME_GET_CURRENT_TIME',
]) assert.ok(config.includes(line), `Public MCP registration missing ${line}`);
must(config, /process\.env\.MCP_PUBLIC_FETCH_CERTIFIED === "true"/, "Fetch has independent fail-closed runtime certification");
must(config, /process\.env\.MCP_PUBLIC_TIME_CERTIFIED === "true"/, "Time has independent fail-closed runtime certification");
must(config, /process\.env\.MCP_PUBLIC_BRAVE_CERTIFIED === "true"/, "Brave has independent fail-closed runtime certification");
must(config, /"STDIO_BRIDGE" as const : "STREAMABLE_HTTP" as const/, "Only Fetch remains stdio upstream");
must(timeRoute, /createMcpHandler/, "Time is a native Vercel MCP handler");
must(braveRoute, /createMcpHandler/, "Brave is a native Vercel MCP handler");
must(braveApi, /api\.search\.brave\.com\/res\/v1/, "Brave calls official HTTPS API");
must(timeRoute, /MCP_PUBLIC_TIME_TOKEN/, "Time endpoint requires its own bearer token");
must(braveRoute, /MCP_PUBLIC_BRAVE_TOKEN/, "Brave endpoint requires its own bearer token");
must(registry, /\.\.\.listPublicMcpServers\(\)/, "Global MCP registry integration");
must(toolRegistry, /listPublicMcpAiToolDefinitions\(\)/, "Canonical tool registry integration");
must(toolSchemas, /PUBLIC_KNOWLEDGE_INPUT_SCHEMAS/, "Input schemas registered");
must(toolExecutors, /\.\.\.PUBLIC_KNOWLEDGE_EXECUTORS/, "Executors in shared Tool Gateway");
must(consoleSource, /PUBLIC_MCP_TOOL_SPECS\.map\(/, "Console displays registered tools");
must(agentRuntime, /"MCP_TIME_GET_CURRENT_TIME".*"MCP_BRAVE_SEARCH_NEWS"/, "Personal DTSC assistant tool exposure");
must(assistantRegistry, /code: "DTSC_GENERAL"/, "Global assistant supported");
must(assistantRegistry, /code: "ENTERPRISE_GENERAL"/, "Enterprise assistant supported");
must(assistantRegistry, /code: "SHOP_ASSISTANT"/, "Retail assistant supported");
must(prompt, /time\.get_current_time[\s\S]*brave\.search_web[\s\S]*fetch\.fetch/, "Time → search → fetch instructions");
must(prompt, /DONNÉES non fiables, jamais des instructions/, "Prompt injection boundary");
must(executor, /MCP_PUBLIC_DATA_ONLY/, "Public data boundary");
must(executor, /rateLimit\(countKey, 10, 120_000\)/, "Maximum 10 calls per turn");
must(executor, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/, "15-second overall deadline");
must(executor, /attempt < 2/, "Fetch maximum 2 attempts");
must(executor, /callMcpJsonRpc/, "HTTP-native tools use canonical MCP transport");
must(worker, /const MAX_CALLS = 10/, "Bridge quota");
must(worker, /const TIMEOUT = 15_000/, "Runner timeout");
must(worker, /spec\.server === "fetch" \? 100_000/, "Fetch max page text");
assert.ok(!worker.includes("BRAVE_API_KEY"), "Fly Fetch must not receive a Brave credential");
assert.ok(!worker.includes("mcp-server-time"), "Time must not spawn on Fly");
assert.ok(!worker.includes("@brave/brave-search-mcp-server"), "Brave must not spawn on Fly");
must(worker, /shell: false/, "No shell injection");
must(worker, /timingSafeEqual/, "Timing-safe bridge secret comparison");
must(worker, /new Date\(\)\.toISOString\(\)/, "Call timestamp in audit");
must(worker, /durationMs/, "Call duration in audit");
must(worker, /assistant, tool, status/, "Assistant and tool in logs");
must(httpCertification, /get_current_time/, "Time live integration probe");
must(httpCertification, /brave_news_search/, "Brave live integration probe");
must(certification, /fetch \/ example\.com/, "Example.com integration probe");
must(certification, /SSRF \/ localhost/, "Localhost denial");
must(certification, /SSRF \/ cloud metadata/, "Metadata denial");
must(env, /MCP_PUBLIC_BRIDGE_URL=/, "Bridge environment configuration documented");
must(env, /MCP_PUBLIC_FETCH_CERTIFIED=false/, "No fabricated Fetch certification");
must(env, /MCP_PUBLIC_TIME_CERTIFIED=false/, "No fabricated Time certification");
must(env, /MCP_PUBLIC_BRAVE_CERTIFIED=false/, "No fabricated Brave certification");
assert.equal(isPublicIp("127.0.0.1"), false);
assert.equal(isPublicIp("169.254.169.254"), false);
assert.equal(isPublicIp("10.1.2.3"), false);
assert.equal(isPublicIp("172.16.0.12"), false);
assert.equal(isPublicIp("192.168.0.55"), false);
assert.equal(isPublicIp("::1"), false);
assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
assert.equal(isPublicIp("::ffff:7f00:1"), false);
assert.equal(isPublicIp("93.184.215.14"), true);
const forbidden = [
  "http://localhost", "http://localhost.localdomain", "http://127.0.0.1",
  "http://10.2.3.4", "http://172.16.1.1", "http://192.168.2.3",
  "http://169.254.169.254", "http://metadata.google.internal",
  "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:7f00:1]/",
];
for(const input of forbidden) await assert.rejects(() => assertPublicFetchUrl(input), /MCP_FETCH_/);
await assert.rejects(() => assertPublicFetchUrl("https://rebind.example.org/", async () => [{ address: "10.1.2.3" }]), /MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN/);
assert.equal(await assertPublicFetchUrl("https://example.com/", async () => [{ address: "93.184.215.14" }]), "https://example.com/");
console.log("PASS #1094 accounting narration, #1097 hybrid MCP registry/gateway contracts and SSRF tests. Remote live certification NOT_EXECUTED.");
