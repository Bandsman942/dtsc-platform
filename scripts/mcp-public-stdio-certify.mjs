#!/usr/bin/env node
/**
 * Run against the isolated Fly.io Fetch runner after provisioning its TLS.
 * Real network probes (no mocks), prints a sanitized execution report.
 * Only successful discovery + expected responses + SSRF denials may certify.
 */
const endpoint = process.env.MCP_PUBLIC_BRIDGE_URL || "https://127.0.0.1:8686/v1/tool";
const secret = process.env.MCP_PUBLIC_BRIDGE_TOKEN || "";
if (!endpoint.startsWith("https://") || !secret) throw new Error("MCP_BRIDGE_CERTIFICATION_ENV_MISSING");

async function probe(path, method = "GET", payload) {
  const url = new URL(path, endpoint);
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method, signal: controller.signal,
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined, redirect: "error", cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data, durationMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}
const servers = await probe("/v1/certification");
const expectedTools = {
  fetch: ["fetch"],
};
const report = { at: new Date().toISOString(), status: "NOT_CERTIFIED", servers: {}, assistantVisibility: { DTSC_GENERAL: "APP_E2E_REQUIRED", ENTERPRISE_GENERAL: "APP_E2E_REQUIRED", SHOP_ASSISTANT: "APP_E2E_REQUIRED" }, tests: [] };
for (const [name, names] of Object.entries(expectedTools)) {
  const value = servers.data?.servers?.find((server) => server.server === name);
  const discovered = Array.isArray(value?.tools) ? value.tools : [];
  const ready = servers.status === 200 && names.every((tool) => discovered.includes(tool));
  report.servers[name] = { status: ready ? "DISCOVERED" : "FAILED", tools: discovered.filter((tool) => names.includes(tool)), transport: "stdio" };
}
const checks = [
  ["fetch / example.com", "fetch.fetch", { url: "https://example.com/" }, 200, /Example Domain/i],
  ["SSRF / localhost", "fetch.fetch", { url: "http://localhost/" }, 422, null],
  ["SSRF / cloud metadata", "fetch.fetch", { url: "http://169.254.169.254/latest/meta-data/" }, 422, null],
];
for (const [label, tool, args, expectStatus, expectedContent] of checks) {
  const result = await probe("/v1/tool", "POST", {
    userId: "certification_test_user", assistant: "DTSC_GENERAL",
    turnKey: "certification_test_" + label.toLowerCase().replace(/[^a-z]/g, "_"), tool, args,
  }).catch(() => ({ status: 0, data: {}, durationMs: 15_000 }));
  const passed = result.status === expectStatus &&
    (!expectedContent || expectedContent.test(result.data?.content || "")) &&
    (result.status !== 422 || /MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN/.test(result.data?.error || ""));
  report.tests.push({ test: label, status: passed ? "PASS" : "FAIL", elapsedMs: result.durationMs, httpStatus: result.status });
}
report.status = Object.values(report.servers).every((server) => server.status === "DISCOVERED") &&
  report.tests.every((test) => test.status === "PASS") ? "LIVE_CERTIFIED" : "NOT_CERTIFIED";
console.log(JSON.stringify(report, null, 2));
if (report.status !== "LIVE_CERTIFIED") process.exitCode = 1;
