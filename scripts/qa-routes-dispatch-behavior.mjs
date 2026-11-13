import assert from "node:assert/strict";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
import { apiRoutes, routeCase } from "../tests/fixtures/routing-1135.mjs";

// Execute the real dispatchers; replace only the immutable legacy handlers.
// HTTP/auth/database behavior of those handlers is covered by isolated E2E.
const overrides = {};
let call;
for (const route of apiRoutes) {
  const prefix = route.family === "exports" ? "@/app/api/admin/exports" : `@/app/api/enterprise/[organizationId]/${route.family}`;
  overrides[`${prefix}/${route.path}/handler`] = Object.fromEntries(route.methods.map(method => [method, async (req, ctx) => {
    assert.equal(req.bodyUsed, false, "Dispatcher must not consume JSON/multipart/CSV bodies");
    const response = new Response("legacy response", { status: 207, headers: { "Content-Type": "text/csv", "X-Legacy": "preserved" } });
    call = { route, method, req, params: ctx ? await ctx.params : {}, response };
    return response;
  }]));
}
const load = workflowTestLoader(overrides);
const dispatchers = {
  exports: load("@/app/api/admin/exports/[dataset]/route"),
  gaming: load("@/app/api/enterprise/[organizationId]/gaming/[...operation]/route"),
  "insurance-connectors": load("@/app/api/enterprise/[organizationId]/insurance-connectors/[...operation]/route"),
};
let forwarded = 0;
for (const route of apiRoutes) {
  const entry = routeCase(route);
  const ctx = { params: Promise.resolve(route.family === "exports" ? { dataset: route.path } : { organizationId: entry.params.organizationId, operation: entry.operation }) };
  const dispatcher = dispatchers[route.family];
  for (const method of route.methods) {
    // Include multipart and JSON streams, query filters, headers and an abort signal.
    const body = route.path === "ocr" ? new FormData() : JSON.stringify({ action: "contract", revision: 7 });
    if (body instanceof FormData) body.append("document", new Blob(["test document"]), "test.txt");
    const req = new Request("http://localhost" + entry.url + "?page=2&environment=UAT", {
      method, headers: { Origin: "http://localhost", "Idempotency-Key": "routing-test" },
      ...(method === "GET" ? {} : { body }), signal: new AbortController().signal,
    });
    call = null;
    const response = await dispatcher[method](req, ctx);
    assert.equal(call?.route, route, entry.url + " selected the wrong legacy handler");
    assert.equal(call.method, method);
    assert.equal(call.req, req, "Request identity (stream, URL, headers, signal) must survive");
    assert.deepEqual(call.params, entry.params, "Every dynamic ID and tenant must survive");
    assert.equal(response, call.response, "Status, headers and response stream must survive");
    forwarded++;
  }
  if (route.family === "exports") continue; // Next.js owns automatic HEAD/OPTIONS here.
  call = null;
  const options = await dispatcher.OPTIONS(new Request("http://localhost" + entry.url, { method: "OPTIONS" }), ctx);
  assert.equal(options.status, 204);
  assert.deepEqual(options.headers.get("Allow").split(", ").sort(), [...route.methods, ...(route.methods.includes("GET") ? ["HEAD"] : []), "OPTIONS"].sort());
  for (const method of ["GET", "POST", "PATCH"].filter(verb => dispatcher[verb] && !route.methods.includes(verb))) {
    const response = await dispatcher[method](new Request("http://localhost" + entry.url, { method }), ctx);
    assert.equal(response.status, 405, entry.url + " must reject " + method);
    assert.equal(response.headers.get("Allow"), options.headers.get("Allow"));
  }
  assert.equal(call, null, "OPTIONS and refused methods must never invoke a handler");
}
for (const family of ["gaming", "insurance-connectors"]) {
  const paths = family === "gaming" ? [["unknown"], ["sessions", "id", "extra"], ["tournaments", "id", "unknown"], []]
    : [["unknown"], ["ocr", "status", "extra"], ["ocr/status"], ["invoices/status"], ["verify/"], []];
  for (const operation of paths) {
    for (const method of ["GET", "POST", "PATCH", "OPTIONS"].filter(verb => dispatchers[family][verb])) {
      call = null;
      const response = await dispatchers[family][method](new Request("http://localhost/api/test", { method }), { params: Promise.resolve({ organizationId: "tenant-b", operation }) });
      assert.equal(response.status, 404, JSON.stringify(operation));
      assert.equal(call, null);
    }
  }
}
for (const dataset of ["unknown", "constructor", "__proto__", "audit/extra"]) {
  call = null;
  const response = await dispatchers.exports.GET(new Request("http://localhost/api/test"), { params: Promise.resolve({ dataset }) });
  assert.equal(response.status, 404);
  assert.equal(call, null);
}
console.log(`ROUTES-02 behavioral contract OK: ${apiRoutes.length} historical endpoints, ${forwarded} method delegations, dynamic IDs, streams, 404/405/OPTIONS.`);
