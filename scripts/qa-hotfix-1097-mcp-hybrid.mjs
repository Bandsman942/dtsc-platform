import assert from "node:assert/strict";
import fs from "node:fs";
import { createMcpHandler } from "mcp-handler";

const { getCurrentTime, convertTime, currentTimeInput, convertTimeInput } = await import("../lib/ai/mcp/public-knowledge-time.ts");
const { searchBrave, braveSearchInput } = await import("../lib/ai/mcp/public-knowledge-brave.ts");
const { withPublicMcpBearer } = await import("../lib/ai/mcp/public-knowledge-route-auth.ts");
const { isPublicMcpServerCertified, isPublicMcpServerConfigured, listPublicMcpServers, listPublicMcpAiToolDefinitions } = await import("../lib/ai/mcp/public-knowledge-config.ts");

// Verify the exact Streamable HTTP shape emitted by DTSC's canonical MCP client
// against the real mcp-handler SDK, not just a fabricated JSON-RPC response.
const protocolHandler = createMcpHandler((server) => {
  server.registerTool("get_current_time", { inputSchema: currentTimeInput }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(getCurrentTime(args, new Date("2026-11-09T21:00:00.000Z"))) }],
  }));
  server.registerTool("convert_time", { inputSchema: convertTimeInput }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(convertTime(args)) }],
  }));
});
async function sdkRequest(method, params) {
  const response = await protocolHandler(new Request("https://app.dtsc-platform.com/api/internal/mcp/time", {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method,
      ...(params.name ? { "Mcp-Name": params.name } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {
      ...params, _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "dtsc-platform", version: "1.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    } }),
  }));
  assert.equal(response.status, 200, `${method} must pass mcp-handler protocol validation`);
  return (await response.json()).result;
}
const discovered = await sdkRequest("tools/list", {});
assert.deepEqual(discovered.tools.map(({ name }) => name).sort(), ["convert_time", "get_current_time"]);
const invoked = await sdkRequest("tools/call", { name: "get_current_time", arguments: { timezone: "Africa/Kinshasa" } });
assert.match(invoked.content[0].text, /2026-11-09T22:00:00/);

const fixture = new Date("2026-11-09T21:00:00.000Z");
assert.deepEqual(getCurrentTime({ timezone: "Africa/Kinshasa" }, fixture), {
  timezone: "Africa/Kinshasa", local_datetime: "2026-11-09T22:00:00", utc_datetime: fixture.toISOString(),
});
assert.match(convertTime({ source_timezone: "Africa/Kinshasa", target_timezone: "Europe/Paris", time: "12:00", date: "2026-07-01" }).target_datetime, /2026-07-01T13:00/);
assert.match(convertTime({ source_timezone: "Africa/Kinshasa", target_timezone: "America/New_York", time: "12:00", date: "2026-11-09" }).target_datetime, /2026-11-09T06:00/);
assert.throws(() => convertTime({ source_timezone: "America/New_York", target_timezone: "Africa/Kinshasa", time: "02:30", date: "2026-03-08" }), /MCP_TIME_NONEXISTENT_LOCAL_TIME/);
assert.throws(() => convertTime({ source_timezone: "America/New_York", target_timezone: "Africa/Kinshasa", time: "01:30", date: "2026-11-01" }), /MCP_TIME_AMBIGUOUS_LOCAL_TIME/);
assert.equal(currentTimeInput.safeParse({ timezone: "Not/AZone" }).success, false);
assert.equal(convertTimeInput.safeParse({ source_timezone: "UTC", target_timezone: "UTC", time: "25:99" }).success, false);
assert.equal(braveSearchInput.safeParse({ query: "", count: 10 }).success, false);
assert.equal(braveSearchInput.safeParse({ query: "ok", count: 100 }).success, false);

const keys = ["MCP_PUBLIC_TIME_TOKEN", "MCP_PUBLIC_BRAVE_TOKEN", "MCP_PUBLIC_TIME_CERTIFIED", "MCP_PUBLIC_BRAVE_CERTIFIED", "MCP_PUBLIC_FETCH_CERTIFIED", "MCP_PUBLIC_BRIDGE_URL", "MCP_PUBLIC_BRIDGE_TOKEN", "BRAVE_API_KEY"];
const originals = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const oldFetch = globalThis.fetch;
try {
  for (const key of keys) delete process.env[key];
  assert.equal(listPublicMcpAiToolDefinitions().length, 0);
  assert.ok(listPublicMcpServers().every((server) => server.status === "DISABLED"));

  const timeToken = "T".repeat(48);
  const braveToken = "B".repeat(48);
  process.env.MCP_PUBLIC_TIME_TOKEN = timeToken;
  assert.equal(isPublicMcpServerConfigured("PUBLIC_TIME"), true);
  assert.equal(isPublicMcpServerCertified("PUBLIC_TIME"), false);
  process.env.MCP_PUBLIC_TIME_CERTIFIED = "true";
  assert.equal(isPublicMcpServerCertified("PUBLIC_TIME"), true);
  assert.equal(isPublicMcpServerCertified("PUBLIC_BRAVE"), false);
  assert.equal(listPublicMcpAiToolDefinitions().length, 2, "Time is available independently of Brave and Fetch");
  const timeServer = listPublicMcpServers().find((server) => server.code === "PUBLIC_TIME");
  assert.equal(timeServer?.transport, "STREAMABLE_HTTP");
  assert.equal(timeServer?.authMode, "BEARER_ENV");
  assert.equal(timeServer?.endpoint, "https://app.dtsc-platform.com/api/internal/mcp/time");

  const protectedHandler = withPublicMcpBearer(async () => Response.json({ allowed: true }), "MCP_PUBLIC_TIME_TOKEN");
  assert.equal((await protectedHandler(new Request("https://app.dtsc-platform.com/api/internal/mcp/time"))).status, 401);
  assert.equal((await protectedHandler(new Request("https://app.dtsc-platform.com/api/internal/mcp/time", { headers: { authorization: `Bearer ${timeToken}` } }))).status, 200);

  process.env.MCP_PUBLIC_BRAVE_TOKEN = braveToken;
  process.env.BRAVE_API_KEY = "test-brave-key-not-real";
  process.env.MCP_PUBLIC_BRAVE_CERTIFIED = "true";
  assert.equal(listPublicMcpAiToolDefinitions().length, 4);
  assert.equal(listPublicMcpServers().find((server) => server.code === "PUBLIC_BRAVE")?.transport, "STREAMABLE_HTTP");

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), header: init?.headers?.["x-subscription-token"], redirects: init?.redirect });
    const isWeb = String(url).includes("/web/search");
    return new Response(JSON.stringify(isWeb ? { web: { results: [{ title: "Documentation", url: "https://example.com/docs", description: "Example" }] } } : { results: [{ title: "News", url: "https://example.com/news", description: "Fresh" }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.equal((await searchBrave("web", { query: "MCP test", count: 3 })).results[0].url, "https://example.com/docs");
  assert.equal((await searchBrave("news", { query: "security news" })).results[0].url, "https://example.com/news");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ header, redirects }) => header === process.env.BRAVE_API_KEY && redirects === "manual"));
  globalThis.fetch = async () => new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
  await assert.rejects(() => searchBrave("web", { query: "test" }), /MCP_BRAVE_AUTH_FAILED/);
  globalThis.fetch = async () => new Response("{}", { status: 429, headers: { "content-type": "application/json" } });
  await assert.rejects(() => searchBrave("news", { query: "test" }), /MCP_BRAVE_RATE_LIMITED/);
  globalThis.fetch = async () => new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  await assert.rejects(() => searchBrave("web", { query: "test" }), /MCP_BRAVE_PROVIDER_UNAVAILABLE/);
  globalThis.fetch = async () => new Response("x".repeat(250_001), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(() => searchBrave("web", { query: "test" }), /MCP_BRAVE_RESPONSE_TOO_LARGE/);

  process.env.MCP_PUBLIC_BRIDGE_URL = "https://dtsc-mcp-fetch.fly.dev/v1/tool";
  process.env.MCP_PUBLIC_BRIDGE_TOKEN = "F".repeat(48);
  process.env.MCP_PUBLIC_FETCH_CERTIFIED = "true";
  assert.equal(listPublicMcpAiToolDefinitions().length, 5);
  const fetchServer = listPublicMcpServers().find((server) => server.code === "PUBLIC_FETCH");
  assert.equal(fetchServer?.transport, "STDIO_BRIDGE");
  assert.deepEqual(fetchServer?.stdioArgs, ["mcp-server-fetch"]);
  assert.equal(fetchServer?.authMode, "NONE", "Fetch uses the existing authenticated bridge envelope");
} finally {
  globalThis.fetch = oldFetch;
  for (const key of keys) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
}

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const worker = read("scripts/mcp-public-stdio-bridge.mjs");
assert.ok(worker.includes('"fetch.fetch"'));
for (const forbidden of ["time.get_current_time", "brave.search_web", "BRAVE_API_KEY", "mcp-server-time", "@brave/brave-search-mcp-server"]) assert.equal(worker.includes(forbidden), false, `Fly runner must not contain ${forbidden}`);
const firewall = read("deploy/fly-fetch/egress.nft");
for (const network of ["10.0.0.0/8", "169.254.0.0/16", "127.0.0.0/8", "fc00::/7", "fe80::/10"]) assert.ok(firewall.includes(network), `Missing egress ban ${network}`);
assert.match(read("deploy/fly-fetch/start.sh"), /nft -f/);
assert.match(read("deploy/fly-fetch/fly.toml"), /auto_stop_machines = "off"/);
assert.match(read("lib/ai/mcp/public-knowledge-executor.ts"), /rateLimit\(countKey, 10, 120_000\)/);
assert.match(read("lib/ai/mcp/public-knowledge-executor.ts"), /MCP_PUBLIC_DATA_ONLY/);
assert.match(read("lib/ai/mcp/public-knowledge-probe.ts"), /probePublicMcpServers/);
assert.match(read("lib/console/console-ai-mcp.ts"), /liveServers\[server\.code\]/);
console.log("PASS #1097: independent certifications, Time/DST, Brave API mock and failures, bearer auth, Fetch-only Fly isolation. Live certification NOT_EXECUTED.");
