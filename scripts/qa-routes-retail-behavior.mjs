import assert from "node:assert/strict";
import fs from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const { routes } = JSON.parse(fs.readFileSync("docs/routing/routes-05a-retail-manifest.json", "utf8"));
const overrides = {};
let calls = [];
let responseStatus = 207;
let failure = null;
for (const route of routes) overrides["@/" + route.handlerPath.slice(0, -3)] = Object.fromEntries(route.methods.map(method => [method, async (req, ctx) => {
  assert.equal(req.bodyUsed, false, "Dispatcher consumed a request stream");
  if (failure) throw failure;
  const response = new Response(responseStatus === 204 ? null : "legacy stream", { status: responseStatus, headers: { "Content-Type": "text/csv", "Retry-After": "60", "X-Legacy": "unchanged" } });
  calls.push({ route, method, req, params: await ctx.params, response });
  return response;
}]));
const load = workflowTestLoader(overrides);
const dispatchers = Object.fromEntries(["invoices", "omnichannel", "pricing"].map(f => [f, load(`@/app/api/enterprise/[organizationId]/retail/${f}/[...operation]/route`)]));
function sample(route, tenant = "routing-tenant-a") {
  const original = { organizationId: tenant };
  const operation = route.path.split("/").map(segment => {
    if (!segment.startsWith("[")) return segment;
    const name = segment.slice(1, -1);
    return original[name] = "sample-" + name;
  });
  return { original, operation, ctx: { params: Promise.resolve({ organizationId: tenant, operation }) } };
}
let delegated = 0;
for (const route of routes) {
  const entry = sample(route);
  const dispatcher = dispatchers[route.family];
  const url = `http://localhost/api/enterprise/routing-tenant-a/retail/${route.family}/${entry.operation.join("/")}?page=2&search=needle&channel=WEB`;
  for (const method of route.methods) {
    for (const content of method === "POST" ? ["json", "multipart"] : ["none"]) {
      const body = content === "multipart" ? new FormData() : JSON.stringify({ action: "APPROVE", revision: 3 });
      if (body instanceof FormData) body.append("document", new Blob(["synthetic document"]), "fixture.txt");
      const req = new Request(url, { method, headers: { Origin: "http://localhost", "Idempotency-Key": "stable-key" }, ...(method === "GET" ? {} : { body }), signal: new AbortController().signal });
      calls = [];
      const response = await dispatcher[method](req, entry.ctx);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].route, route, "Wrong handler or static-path priority");
      assert.equal(calls[0].method, method);
      assert.equal(calls[0].req, req, "Request identity and URL/query/headers/signal changed");
      assert.deepEqual(calls[0].params, entry.original, "Tenant or dynamic ID mapping changed");
      assert.equal(response, calls[0].response, "Status, headers or response stream changed");
      delegated++;
    }
  }
  calls = [];
  const options = await dispatcher.OPTIONS(new Request(url, { method: "OPTIONS" }), entry.ctx);
  assert.equal(options.status, 204);
  const expected = [...route.methods, ...(route.methods.includes("GET") ? ["HEAD"] : []), "OPTIONS"].sort();
  assert.deepEqual(options.headers.get("Allow").split(/,\s*/).sort(), expected);
  for (const method of ["GET", "POST"].filter(m => !route.methods.includes(m))) {
    const response = await dispatcher[method](new Request(url, { method }), entry.ctx);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), options.headers.get("Allow"));
  }
  assert.equal(calls.length, 0, "OPTIONS/refused method called a business handler");
}
for (const [family, operations] of Object.entries({
  invoices: [[], ["workflow/extra"], ["invoice", "print", "extra"], ["invoice", "payments", "payment", "allocate", "extra"], ["constructor"], ["__proto__"]],
  omnichannel: [[], ["unknown"], ["orders/id", "cancel"], ["returns", "validators", "extra"]],
  pricing: [[], ["catalog/preview"], ["conditions", "extra"], ["constructor"]],
})) for (const operation of operations) for (const method of ["GET", "POST", "OPTIONS"]) {
  calls = [];
  const response = await dispatchers[family][method](new Request("http://localhost/api/test", { method }), { params: Promise.resolve({ organizationId: "tenant-b", operation }) });
  assert.equal(response.status, 404, family + "/" + operation.join("/"));
  assert.equal(calls.length, 0);
}
const print = routes.find(r => r.family === "invoices" && r.path === "[invoiceId]/print");
const req = new Request("http://localhost/api/test");
const ctx = { params: Promise.resolve({ organizationId: "tenant-b", operation: ["id/with/slash", "print"] }) };
for (responseStatus of [200, 201, 202, 204, 400, 401, 403, 404, 409, 413, 422, 429, 503]) {
  calls = [];
  const response = await dispatchers.invoices.GET(req, ctx);
  assert.equal(calls[0].route, print);
  assert.deepEqual(calls[0].params, { organizationId: "tenant-b", invoiceId: "id/with/slash" }, "Dynamic segment must retain original decoded value");
  assert.equal(response, calls[0].response);
}
failure = new Error("legacy rejection");
await assert.rejects(dispatchers.invoices.GET(req, ctx), error => error === failure, "Dispatcher must not hide original errors");
console.log(`ROUTES-05A behavior OK: ${routes.length} endpoints, ${delegated} JSON/multipart delegations, literal priority, every dynamic ID, original statuses/streams and 404/405/OPTIONS.`);
