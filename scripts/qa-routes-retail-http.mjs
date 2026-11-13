import assert from "node:assert/strict";
import fs from "node:fs";

// API-only acceptance: no browser driver, production traffic or business mutation.
const base = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000");
const database = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.equal(process.env.E2E_ROUTING_RETAIL_ISOLATED, "true", "Isolated HTTP acceptance must be explicitly enabled");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
assert.ok(["/dtsc_shop2_behavioral", "/dtsc_routing_retail_test"].includes(database.pathname), "Only dedicated synthetic fixture databases are accepted");
const { routes } = JSON.parse(fs.readFileSync("docs/routing/routes-05a-retail-manifest.json", "utf8"));
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const headers = { origin: base.origin, referer: base.origin + "/auth/sign-in" };
const results = [];
function pathFor(route, tenant = organizationId) {
  return `/api/enterprise/${tenant}/retail/${route.family}/` + route.path.split("/").map(s => s.startsWith("[") ? "routing-" + s.slice(1, -1) : s).join("/");
}
async function checked(label, path, method, expected, extra = {}) {
  const started = performance.now();
  const response = await fetch(new URL(path, base), { method, redirect: "manual", signal: AbortSignal.timeout(30000), headers, ...extra });
  assert.equal(response.status, expected, `${label}: ${method} ${path}`);
  if (method === "HEAD" || expected === 204) assert.equal((await response.arrayBuffer()).byteLength, 0);
  else await response.arrayBuffer();
  results.push({ label, path, method, status: response.status, durationMs: Math.round(performance.now() - started) });
  return response;
}
for (const route of routes) {
  const path = pathFor(route);
  for (const method of ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]) {
    const allowed = route.methods.includes(method) || method === "HEAD" && route.methods.includes("GET");
    const expected = method === "OPTIONS" ? 204 : allowed ? 401 : 405;
    const response = await checked("anonymous historical contract", path, method, expected);
    if (method === "OPTIONS") assert.deepEqual(response.headers.get("allow").split(/,\s*/).sort(), [...route.methods, ...(route.methods.includes("GET") ? ["HEAD"] : []), "OPTIONS"].sort());
  }
}
for (const path of ["invoices/workflow%2Fextra", "invoices/id/print/extra", "omnichannel/orders%2Fid/cancel", "omnichannel/unknown", "pricing/catalog%2Fpreview", "pricing/conditions/extra"]) {
  for (const method of ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]) await checked("unknown path shape", `/api/enterprise/${organizationId}/retail/${path}`, method, 404);
}
await checked("decoded dynamic invoice ID still reaches legacy auth", `/api/enterprise/${organizationId}/retail/invoices/id%2Fpart/print`, "GET", 401);
await checked("unmoved invoice collection", `/api/enterprise/${organizationId}/retail/invoices`, "GET", 401);
for (const family of ["invoices/id/transition", "omnichannel/orders", "pricing/preview"]) {
  await checked("same-origin protection", `/api/enterprise/${organizationId}/retail/${family}`, "POST", 403, { headers: { origin: "https://untrusted.example" } });
}
const login = await fetch(new URL("/api/auth/sign-in", base), {
  method: "POST", redirect: "manual", headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test", password: process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!", organizationId, next: "/enterprise-modules/RETAIL_POS" }),
});
assert.equal(login.status, 200, "Canonical isolated fixture login failed");
const cookie = login.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
assert.ok(cookie.includes("dtsc_session="), "Fixture session cookie absent");
await login.arrayBuffer();
for (const route of routes) {
  for (const method of route.methods) await checked("foreign tenant denied", pathFor(route, "routing-1145-foreign-tenant"), method, 403, { headers: { ...headers, cookie } });
}
for (const path of ["pricing/catalog?page=1&pageSize=5", "pricing/conditions?page=1&pageSize=5"]) {
  await checked("authorized Retail read", `/api/enterprise/${organizationId}/retail/${path}`, "GET", 200, { headers: { ...headers, cookie } });
}
const durations = results.map(r => r.durationMs).sort((a, b) => a - b);
const report = { schemaVersion: 1, issue: 1145, environment: "ISOLATED_LOCAL_NEXT_START", generatedAt: new Date().toISOString(), sourceSha: process.env.GITHUB_SHA || null, browserUsed: false, totalChecks: results.length, passed: results.length, latencyScope: "CI_HTTP_ONLY_NOT_VERCEL_COLD_START", p95Ms: durations[Math.ceil(durations.length * .95) - 1], results };
fs.mkdirSync("artifacts/routing", { recursive: true });
fs.writeFileSync("artifacts/routing/retail-http-1145.json", JSON.stringify(report, null, 2) + "\n");
console.log(`ROUTES-05A HTTP OK: ${results.length} checks; 24 endpoints × 7 methods, encoded paths, same-origin, tenant denial and authorized reads. No browser used.`);
