import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve("lib/payments");
const files = ["payment-service", "payment-access", "payment-state-machine", "payment-idempotency", "payment-errors", "payment-types"];
for (const file of files) assert.ok(existsSync(resolve(root, `${file}.ts`)), `${file} missing`);

// Pure unit tests: transpile TS in-memory; no DB, provider network or private env required.
const cache = new Map();
function loadTs(path) {
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  cache.set(path, mod.exports);
  const localRequire = (specifier) => specifier.startsWith("./")
    ? loadTs(resolve(dirname(path), `${specifier.slice(2)}.ts`))
    : require(specifier);
  runInNewContext(`(function(exports, require, module) { ${js}\n})`, { Buffer })(mod.exports, localRequire, mod);
  cache.set(path, mod.exports);
  return mod.exports;
}

const { assertPaymentTransition, assertPaymentCanFinalize } = loadTs(resolve(root, "payment-state-machine.ts"));
const { makePaymentReference, assertPaymentReplay, assertExactPaymentAmount } = loadTs(resolve(root, "payment-idempotency.ts"));
const { Prisma } = require("@prisma/client");
const conflict = (code) => (error) => error?.code === code;

for (const [from, to] of [["PENDING", "ACCEPTED"], ["PENDING", "PAID"], ["ACCEPTED", "PAID"], ["ACCEPTED", "FAILED"], ["PENDING", "CANCELED"]]) {
  assert.equal(assertPaymentTransition(from, to), "CHANGED");
}
assert.equal(assertPaymentTransition("PAID", "PAID"), "UNCHANGED");
assert.equal(assertPaymentCanFinalize("PAID"), "UNCHANGED");
assert.equal(assertPaymentCanFinalize("ACCEPTED"), "CHANGED");
assert.throws(() => assertPaymentTransition("PAID", "PENDING"), conflict("PAYMENT_INVALID_TRANSITION"));
assert.throws(() => assertPaymentTransition("FAILED", "PAID"), conflict("PAYMENT_INVALID_TRANSITION"));
assert.throws(() => assertPaymentTransition("FAILED", "PENDING"), conflict("PAYMENT_INVALID_TRANSITION"));
assert.equal(assertPaymentTransition("FAILED", "PENDING", { retry: true }), "CHANGED");
assert.throws(() => assertPaymentCanFinalize("CANCELED"), conflict("PAYMENT_INVALID_TRANSITION"));

const a = makePaymentReference({ scope: "ORGANIZATION", ownerId: "org-1", requestId: "retry-key" });
assert.equal(a, makePaymentReference({ scope: "ORGANIZATION", ownerId: "org-1", requestId: "retry-key" }));
assert.notEqual(a, makePaymentReference({ scope: "ORGANIZATION", ownerId: "org-2", requestId: "retry-key" }));
assert.notEqual(a, makePaymentReference({ scope: "PERSONAL", ownerId: "org-1", requestId: "retry-key" }));
assert.ok(!a.includes("org-1"), "references cannot expose tenant identifiers");

const existing = {
  userId: "u1", organizationId: "org-1", provider: "MAISHAPAY", currency: "USD",
  amount: new Prisma.Decimal("180.00"), subscriptionId: null, organizationSubscriptionId: "sub-1",
};
const replay = { existing, userId: "u1", organizationId: "org-1", provider: "MAISHAPAY", currency: "USD", amount: new Prisma.Decimal("180") };
assert.doesNotThrow(() => assertPaymentReplay(replay));
assert.throws(() => assertPaymentReplay({ ...replay, organizationId: "org-2" }), conflict("PAYMENT_IDEMPOTENCY_CONFLICT"));
assert.throws(() => assertPaymentReplay({ ...replay, amount: new Prisma.Decimal("180.01") }), conflict("PAYMENT_IDEMPOTENCY_CONFLICT"));
assert.throws(() => assertPaymentReplay({ ...replay, currency: "CDF" }), conflict("PAYMENT_IDEMPOTENCY_CONFLICT"));
assert.throws(() => assertPaymentReplay({ ...replay, provider: "MANUAL" }), conflict("PAYMENT_IDEMPOTENCY_CONFLICT"));
assert.doesNotThrow(() => assertExactPaymentAmount(existing, { amount: new Prisma.Decimal("180.00"), currency: "USD" }));
assert.throws(() => assertExactPaymentAmount(existing, { amount: new Prisma.Decimal("180.00"), currency: "CDF" }), conflict("PAYMENT_AMOUNT_MISMATCH"));

// Functional RBAC/tenant tests with an in-memory repository and signed-session
// boundary stand-in. No production DB or authentication secret is accessed.
let activeSession;
let memberRole = "OWNER";
let memberEnabled = true;
let employeeEnabled = true;
let sameOrigin = true;
let rateLimitAllowed = true;
const mockPrisma = {
  user: { findFirst: async ({ where }) => where.id === activeSession?.userId && where.status === "ACTIVE" ? { id: where.id } : null },
  organizationMember: { findFirst: async ({ where }) => memberEnabled && where.userId === activeSession?.userId &&
    (where.organizationId === "org-1" || where.organizationId === "dtsc-internal") ? { role: memberRole } : null },
  hrcfoEmployee: { findFirst: async () => employeeEnabled ? { id: "employee-1" } : null },
};
const aliases = {
  "@/lib/auth": { getSession: async () => activeSession },
  "@/lib/prisma": { prisma: mockPrisma },
  "@/lib/organizations": { DTSC_INTERNAL_ORGANIZATION_ID: "dtsc-internal", isDtscInternalSession: (s) => s?.activeContext === "DTSC_INTERNAL" && s.activeOrganizationId === "dtsc-internal" },
  "@/lib/console/console-capabilities": { CONSOLE_CAPABILITIES: { SUBSCRIPTIONS_READ: "READ", SUBSCRIPTIONS_MANAGE: "MANAGE" }, getConsoleAccessDecision: async () => ({ allowed: true }) },
  "@/lib/settings": { getAppSettings: async () => ({ adminRoleAccess: {} }) },
  "@/lib/admin-access": { parseAdminRoleAccess: (value) => value },
  "@/lib/rate-limit": { getRateLimitKey: () => "unit", rateLimit: async () => ({ ok: rateLimitAllowed }) },
  "@/lib/request-security": { isSameOriginRequest: () => sameOrigin },
};
const accessJs = ts.transpileModule(readFileSync(resolve(root, "payment-access.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const accessModule = { exports: {} };
runInNewContext(`(function(exports, require, module) { ${accessJs}\n})`, { Buffer })(
  accessModule.exports, (specifier) => aliases[specifier] || (specifier.startsWith("./") ? loadTs(resolve(root, `${specifier.slice(2)}.ts`)) : require(specifier)), accessModule,
);
const { assertPaymentTargetAccess, assertInternalPaymentAccess, assertPaymentMutationBoundary } = accessModule.exports;
const organizationSession = { userId: "u1", role: "ADMIN", activeContext: "ORGANIZATION", activeOrganizationId: "org-1" };
activeSession = organizationSession;
await assertPaymentTargetAccess(organizationSession, { scope: "ORGANIZATION", organizationId: "org-1" }, "CREATE");
await assert.rejects(() => assertPaymentTargetAccess(organizationSession, { scope: "ORGANIZATION", organizationId: "org-2" }, "READ"), conflict("PAYMENT_ACCESS_DENIED"));
memberRole = "MEMBER";
await assert.rejects(() => assertPaymentTargetAccess(organizationSession, { scope: "ORGANIZATION", organizationId: "org-1" }, "READ"), conflict("PAYMENT_ACCESS_DENIED"));
memberRole = "OWNER";
memberEnabled = false;
await assert.rejects(() => assertPaymentTargetAccess(organizationSession, { scope: "ORGANIZATION", organizationId: "org-1" }, "CREATE"), conflict("PAYMENT_ACCESS_DENIED"));
memberEnabled = true;
await assert.rejects(() => assertPaymentTargetAccess(organizationSession, { scope: "PERSONAL", userId: "another-user" }, "READ"), conflict("PAYMENT_ACCESS_DENIED"));
await assertPaymentMutationBoundary({ session: organizationSession, request: { url: "https://app.example.test/api/payments" } }, "test");
sameOrigin = false;
await assert.rejects(() => assertPaymentMutationBoundary({ session: organizationSession, request: { url: "https://app.example.test/api/payments" } }, "test"), conflict("PAYMENT_ACCESS_DENIED"));
sameOrigin = true;
rateLimitAllowed = false;
await assert.rejects(() => assertPaymentMutationBoundary({ session: organizationSession, request: { url: "https://app.example.test/api/payments" } }, "test"), conflict("PAYMENT_RATE_LIMITED"));
rateLimitAllowed = true;
const internalSession = { userId: "u1", role: "ADMIN", activeContext: "DTSC_INTERNAL", activeOrganizationId: "dtsc-internal" };
activeSession = internalSession;
await assertInternalPaymentAccess(internalSession, "VALIDATOR");
employeeEnabled = false;
await assert.rejects(() => assertInternalPaymentAccess(internalSession, "VALIDATOR"), conflict("PAYMENT_VALIDATOR_REQUIRED"));
employeeEnabled = true;
memberEnabled = false;
await assert.rejects(() => assertInternalPaymentAccess(internalSession, "READ"), conflict("PAYMENT_ACCESS_DENIED"));
memberEnabled = true;
await assert.rejects(() => assertInternalPaymentAccess({ ...internalSession, activeContext: "GLOBAL_CLIENT" }, "MANAGE"), conflict("PAYMENT_ACCESS_DENIED"));

// Route integration tests: signed-session fixture and service stand-ins keep
// actual GET response/error contracts observable without a database.
let observedTarget;
let observedFilters;
let invoiceLookupError = null;
const { PaymentDomainError } = loadTs(resolve(root, "payment-errors.ts"));
const routeAliases = {
  "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
  zod: require("zod"),
  "@/lib/auth": { getSession: async () => activeSession },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/payments/payment-errors": { PaymentDomainError },
  "@/lib/payments/payment-service": {
    getTenantPayments: async (session, target, options) => {
      observedTarget = target;
      observedFilters = options;
      await assertPaymentTargetAccess(session, target, "READ");
      return { items: [{ id: "p1", status: "PAID" }], total: 1, page: options.page, pageSize: options.pageSize, pages: 1 };
    },
    getInvoicePaymentState: async () => {
      if (invoiceLookupError) throw invoiceLookupError;
      return { invoice: { id: "invoice-1", status: "ISSUED" }, payment: null };
    },
  },
  "@/lib/rate-limit": { getRateLimitKey: () => "unit", rateLimit: async () => ({ ok: rateLimitAllowed }) },
};
function loadRoute(path) {
  const outputText = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  runInNewContext(`(function(exports, require, module) { ${outputText}\n})`, { URL, Buffer })(
    mod.exports, (specifier) => routeAliases[specifier] || require(specifier), mod,
  );
  return mod.exports;
}
const { GET: getPaymentHistory } = loadRoute(resolve("app/api/billing/payments/route.ts"));
const { GET: getInvoiceStatus } = loadRoute(resolve("app/api/billing/invoices/[id]/payment/route.ts"));
const req = (query = "") => ({ url: `https://app.dtsc-platform.com/api/billing/payments${query}`, method: "GET" });
activeSession = null;
assert.equal((await getPaymentHistory(req())).status, 401);
assert.equal((await getInvoiceStatus(req(), { params: Promise.resolve({ id: "invoice-1" }) })).status, 401);
activeSession = organizationSession;
assert.equal((await getPaymentHistory(req("?organizationId=org-2"))).status, 400);
assert.equal((await getPaymentHistory(req("?pageSize=500"))).status, 400);
assert.equal((await getPaymentHistory(req("?from=2026-11-01T00%3A00%3A00Z&to=2026-10-01T00%3A00%3A00Z"))).status, 400);
const listResponse = await getPaymentHistory(req("?page=2&pageSize=10&status=PAID&from=2026-10-01T00%3A00%3A00Z"));
assert.equal(listResponse.status, 200);
assert.deepEqual(JSON.parse(JSON.stringify(observedTarget)), { scope: "ORGANIZATION", organizationId: "org-1" });
assert.equal(observedFilters.page, 2);
assert.equal(observedFilters.pageSize, 10);
assert.equal(observedFilters.status, "PAID");
assert.equal(listResponse.body.items.length, 1);
memberRole = "MEMBER";
assert.equal((await getPaymentHistory(req())).status, 403);
memberRole = "OWNER";
activeSession = { ...organizationSession, activeContext: "GLOBAL_CLIENT", activeOrganizationId: null };
assert.equal((await getPaymentHistory(req())).status, 200);
assert.deepEqual(JSON.parse(JSON.stringify(observedTarget)), { scope: "PERSONAL", userId: "u1" });
activeSession = organizationSession;
invoiceLookupError = new PaymentDomainError("PAYMENT_ACCESS_DENIED");
assert.equal((await getInvoiceStatus(req(), { params: Promise.resolve({ id: "invoice-1" }) })).status, 404);
invoiceLookupError = null;
assert.equal((await getInvoiceStatus(req(), { params: Promise.resolve({ id: "invoice-1" }) })).status, 200);

const access = readFileSync(resolve(root, "payment-access.ts"), "utf8");
const service = readFileSync(resolve(root, "payment-service.ts"), "utf8");
for (const expected of ["getSession()", "isSameOriginRequest", "await rateLimit", "organizationMember.findFirst", "status: \"ACTIVE\"", "removedAt: null", "isDtscInternalSession", "SUBSCRIPTIONS_MANAGE", "hrcfoEmployee.findFirst", "member.role !== \"OWNER\""]) {
  assert.ok(access.includes(expected), `access contract missing ${expected}`);
}
for (const expected of ["tx.auditLog.create", "tx.apiLog.create", "prisma.$transaction", "FOR UPDATE", "updateMany", "assertPaymentReplay", "assertExactPaymentAmount", "finalizeManualSubscriptionPayment", "getTenantPayments", "getInvoicePaymentState", "getPaymentFinanceSummary", "invoice.payment.organizationId !== invoice.organizationId", "PAYMENT_UNSUPPORTED_OPERATION"]) {
  assert.ok(service.includes(expected), `service contract missing ${expected}`);
}
assert.ok(!/\benterprisePayment\.(create|update|upsert)\s*\(/.test(service), "ERP client payments must remain separate");
assert.ok(!/\bDtscPayment\b/.test(service), "no parallel primary payment model");

console.log("PASS DTSC Payments PAY-1: transitions, idempotence, amount/currency, RBAC/tenant, HTTP GET & tx contracts");
