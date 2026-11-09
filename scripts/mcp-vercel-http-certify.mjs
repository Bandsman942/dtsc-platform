#!/usr/bin/env node
/**
 * REAL, authenticated HTTP certification against main/Production endpoints.
 * Only reports PASS after live tools/list and tools/call. Never prints tokens.
 * Run after the first main deployment with tokens set, before certified flags.
 */
const origin = process.env.MCP_PUBLIC_HTTP_CERTIFY_ORIGIN || "https://app.dtsc-platform.com";
const jobs = [
  { server: "time", token: process.env.MCP_PUBLIC_TIME_TOKEN || "", expected: ["get_current_time", "convert_time"], calls: [
    { name: "get_current_time", arguments: { timezone: "Africa/Kinshasa" }, expected: /Africa\/Kinshasa/ },
    { name: "convert_time", arguments: { source_timezone: "Africa/Kinshasa", target_timezone: "Europe/Paris", time: "12:00", date: "2026-07-01" }, expected: /2026-07-01T13:00/ },
  ] },
  { server: "brave", token: process.env.MCP_PUBLIC_BRAVE_TOKEN || "", expected: ["brave_web_search", "brave_news_search"], calls: [
    { name: "brave_web_search", arguments: { query: "Model Context Protocol documentation", count: 3 }, expected: /https?:\/\// },
    { name: "brave_news_search", arguments: { query: "technology security news", count: 3 }, expected: /https?:\/\// },
  ] },
];
// Tokens must never be sent to an accidentally overridden or attacker-owned host.
const certificationOrigin = new URL(origin);
if (certificationOrigin.protocol !== "https:" || certificationOrigin.origin !== "https://app.dtsc-platform.com" ||
  !jobs.every(({ token }) => token.length >= 32)) throw new Error("MCP_HTTP_CERTIFICATION_ENV_MISSING");
let requestId = 0;
async function call(job, method, params) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL(`/api/internal/mcp/${job.server}`, origin), {
      method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { authorization: `Bearer ${job.token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, ...(params?.name ? { "Mcp-Name": params.name } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params: { ...params,
        _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "dtsc-certify", version: "1.0.0" }, "io.modelcontextprotocol/clientCapabilities": {} },
      } }),
    });
    const body = await response.text();
    let parsed = {};
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const data = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).at(-1)?.slice(5).trim();
      if (data) parsed = JSON.parse(data);
    } else parsed = JSON.parse(body);
    return { httpStatus: response.status, result: parsed.result, error: Boolean(parsed.error), durationMs: Math.round(performance.now() - started) };
  } catch { return { httpStatus: 0, result: null, error: true, durationMs: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timer); }
}
const report = { at: new Date().toISOString(), status: "NOT_CERTIFIED", servers: {} };
for (const job of jobs) {
  const discovered = await call(job, "tools/list", {});
  const found = Array.isArray(discovered.result?.tools) ? discovered.result.tools.map(({ name }) => name) : [];
  const tests = [];
  for (const test of job.calls) {
    const answer = await call(job, "tools/call", { name: test.name, arguments: test.arguments });
    const text = Array.isArray(answer.result?.content) ? answer.result.content.filter((x) => x?.type === "text").map((x) => x.text).join("\n") : "";
    tests.push({ tool: test.name, httpStatus: answer.httpStatus, durationMs: answer.durationMs,
      status: answer.httpStatus === 200 && !answer.error && !answer.result?.isError && test.expected.test(text) ? "PASS" : "FAIL" });
  }
  const status = discovered.httpStatus === 200 && !discovered.error && job.expected.every((name) => found.includes(name)) && tests.every((t) => t.status === "PASS") ? "LIVE_CERTIFIED" : "NOT_CERTIFIED";
  report.servers[job.server] = { status, discoveryMs: discovered.durationMs, tools: found.filter((name) => job.expected.includes(name)), tests };
}
report.status = Object.values(report.servers).every((x) => x.status === "LIVE_CERTIFIED") ? "LIVE_CERTIFIED" : "NOT_CERTIFIED";
console.log(JSON.stringify(report, null, 2));
if (report.status !== "LIVE_CERTIFIED") process.exitCode = 1;
