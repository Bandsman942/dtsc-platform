import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sources = [
  "lib/enterprise/retail/offline-invoice.ts",
  "lib/enterprise/retail/browser-device-connect.ts",
  "lib/enterprise/retail/commercial-admin.ts",
  "lib/enterprise/retail/inventory-policy.ts",
  "app/enterprise-modules/retail-page.tsx",
  "lib/enterprise/retail/commercial-schemas.ts",
  "lib/enterprise/retail/invoice-checkout.ts",
  "lib/enterprise/retail/offline-client.ts",
  "lib/enterprise/retail/offline-server.ts",
  "components/enterprise/professional/retail-offline-continuity.tsx",
  "components/enterprise/professional/retail-device-readiness.tsx",
  "components/enterprise/professional/retail-commercial-workspace.tsx",
  "components/enterprise/professional/retail-invoice-flow-workbench.tsx",
  "components/enterprise/professional/retail-global-readiness.tsx",
  "components/enterprise/professional/retail-payment-followup.tsx",
  "components/enterprise/professional/retail-expiry-alerts-panel.tsx",
  "components/enterprise/professional/retail-omnichannel-panel.tsx",
  "components/public/public-nav.tsx",
  "app/api/enterprise/[organizationId]/retail/offline/sync/route.ts",
  "app/api/enterprise/[organizationId]/retail/inventory-alerts/route.ts",
  "app/api/enterprise/[organizationId]/retail/pricing/conditions/route.ts",
  "app/api/enterprise/[organizationId]/retail/promotions/route.ts",
  "app/api/enterprise/[organizationId]/retail/pricing/preview/route.ts",
  "app/api/enterprise/[organizationId]/retail/returns/route.ts",
  "app/api/enterprise/[organizationId]/retail/devices/route.ts",
  "app/api/enterprise/[organizationId]/retail/payments/invoices/route.ts",
  "app/api/enterprise/[organizationId]/retail/omnichannel/orders/route.ts",
];
for (const path of sources) {
  const result = ts.transpileModule(read(path), {
    reportDiagnostics: true, fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const errors = result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) || [];
  assert.equal(errors.length, 0, `TS/TSX syntax failed ${path}: ${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("; ")}`);
}
assert.match(read("lib/enterprise/retail/offline-server.ts"), /draftOnly: invoiceDraftMode/);
assert.match(read("lib/enterprise/retail/offline-server.ts"), /lotTrackedInventory\.has/);
assert.match(read("app/api/enterprise/[organizationId]/retail/offline/sync/route.ts"), /syncRetailOfflineInvoiceDraft/);
assert.match(read("components/enterprise/professional/retail-offline-continuity.tsx"), /tenders: snapshot\.policy\.draftOnly \? \[\]/);
assert.match(read("components/enterprise/professional/retail-offline-continuity.tsx"), /validation en ligne/);
assert.match(read("app/api/enterprise/[organizationId]/retail/payments/invoices/route.ts"), /EnterpriseRetailInvoicePaymentProposal/);
assert.match(read("components/public/public-nav.tsx"), /onPointerEnter=/);
assert.match(read("lib/enterprise/retail/offline-client.ts"), /function offlineLocalScope/);
assert.match(read("lib/enterprise/retail/offline-client.ts"), /if \(!organizationId \|\| !actorUserId\.trim\(\)\)/);
assert.match(read("lib/enterprise/retail/offline-client.ts"), /RETAIL_OFFLINE_UNRESOLVED_LOCAL_OPERATIONS/);
assert.match(read("components/enterprise/professional/retail-offline-continuity.tsx"), /clearDeviceData/);
assert.match(read("components/enterprise/professional/retail-device-readiness.tsx"), /exportDevices/);
assert.match(read("components/enterprise/professional/retail-omnichannel-panel.tsx"), /exportOmnichannelOrders/);
assert.match(read("components/enterprise/professional/retail-offline-continuity.tsx"), /actorUserId/);
assert.match(read("lib/enterprise/retail/inventory-policy.ts"), /RETAIL_STOCK_LOT_EXPIRED_WARNING/);
assert.match(read("lib/enterprise/retail/invoice-checkout.ts"), /stockWarnings\.map/);
assert.match(read("app/api/enterprise/[organizationId]/retail/invoices/route.ts"), /stockWarningCount/);
assert.match(read("lib/enterprise/retail/omnichannel.ts"), /RETAIL_OMNICHANNEL_CHANNELS/);
assert.match(read("lib/enterprise/retail/omnichannel.ts"), /channelCode: filters\.channel/);
assert.match(read("app/api/enterprise/[organizationId]/retail/omnichannel/orders/route.ts"), /channelCode: z\.enum\(RETAIL_OMNICHANNEL_CHANNELS\)/);
assert.match(read("components/enterprise/professional/retail-omnichannel-panel.tsx"), /channelCode: originChannel/);
assert.match(read("components/enterprise/professional/retail-payment-followup.tsx"), /downloadProfessionalXlsx/);
assert.match(read("components/enterprise/professional/retail-expiry-alerts-panel.tsx"), /downloadProfessionalPdf/);
assert.match(read("components/enterprise/professional/retail-commercial-workspace.tsx"), /exportCommercialRegister/);
assert.match(read("lib/enterprise/retail/invoice-checkout.ts"), /RETAIL_FINANCE_PROMOTION_LEDGER_REQUIRED/);
assert.match(read("app/api/enterprise/[organizationId]/retail/pricing/preview/route.ts"), /decision\.promotions\?\.length/);
assert.match(read("app/api/enterprise/[organizationId]/retail/pricing/preview/route.ts"), /if \(parsed\.data\.invoiceCheckout\)/);
assert.match(read("components/enterprise/professional/retail-invoice-flow-workbench.tsx"), /invoiceCheckout: true/);
assert.doesNotMatch(read("components/enterprise/professional/retail-invoice-flow-workbench.tsx"), /setCouponCode/);
assert.match(read("lib/enterprise/retail/browser-device-connect.ts"), /requestDevice|requestPort/);
assert.match(read("lib/enterprise/retail/commercial-admin.ts"), /EnterpriseRetailPriceConditionWhereInput/);
assert.match(read("lib/enterprise/retail/commercial-admin.ts"), /RETAIL_PRICE_CONDITION_DUPLICATE/);
assert.match(read("lib/enterprise/retail/commercial-admin.ts"), /RETAIL_PRICE_CONDITION_STALE/);
assert.match(read("lib/enterprise/retail/commercial-admin.ts"), /enterpriseRetailPriceCondition\.updateMany/);
assert.match(read("components/enterprise/professional/retail-commercial-workspace.tsx"), /revision: condition\.revision/);
assert.match(read("components/enterprise/professional/retail-commercial-workspace.tsx"), /RegisterPager/);
assert.match(read("app/api/enterprise/[organizationId]/retail/inventory-alerts/route.ts"), /lowStockPageSize/);

const schemaModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("lib/enterprise/retail/commercial-schemas.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: schemaModule, exports: schemaModule.exports,
  require(name) { if (name === "zod") return { z }; throw Error("Unexpected schema dependency " + name); },
});
const priceRuleSchema = schemaModule.exports.retailPriceConditionUpsertSchema;
const priceRule = { catalogPriceId: "price-1", channelCode: "POS", priority: 1, isActive: true };
assert.ok(priceRuleSchema.safeParse(priceRule).success, "Creating a new price condition must not require an id");
assert.ok(!priceRuleSchema.safeParse({ ...priceRule, id: "rule-1" }).success,
  "Editing a condition without revision is unsafe");
assert.ok(priceRuleSchema.safeParse({ ...priceRule, id: "rule-1", revision: 3 }).success,
  "Editing the exact condition with a revision is allowed");

const now = new Date();
const pending = new Map();
let invoiceCreates = 0;
let permissionChecks = 0;
let grant = true;
const prisma = {
  enterpriseRetailOfflineSyncOperation: {
    findFirst: async ({ where }) => pending.get(where.operationUuid) || null,
    create: async ({ data }) => { const created = { ...data, id: data.operationUuid, status: "RECEIVED" }; pending.set(data.operationUuid, created); return created; },
    update: async ({ where, data }) => { const old = pending.get(where.organizationId_operationUuid.operationUuid); const updated = { ...old, ...data }; pending.set(old.operationUuid, updated); return updated; },
  },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: { invoiceCheckoutEnabled: true } }) },
  enterpriseRetailOfflineSnapshot: { findFirst: async () => ({ currencyCode: "CDF", validFrom: new Date(now.getTime()-60_000), validUntil: new Date(now.getTime()+3_600_000) }) },
};
const offlineTs = read("lib/enterprise/retail/offline-invoice.ts");
const compiled = ts.transpileModule(offlineTs, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const runtimeModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: runtimeModule,
  exports: runtimeModule.exports,
  Buffer, Date, Promise, Map, Set, Number, JSON,
  require(name) {
    if (name === "node:crypto") return requireCrypto();
    if (name === "@prisma/client") return { Prisma };
    if (name === "zod") return { z };
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError: class EnterpriseRetailError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } } };
    if (name === "@/lib/enterprise/retail/site-access") return { requireRetailSiteCapability: async (_org, _actor, _site, capability) => { permissionChecks++; assert.equal(capability, "PREPARE_INVOICE"); if (!grant) throw Error("REVOKED"); } };
    if (name === "@/lib/enterprise/retail/commercial-engine") return { previewRetailCommercialPricing: async () => ({ lines: [{ catalogItemId: "sku-1", resolvedUnitPrice: "100", taxIncluded: false, taxRate: "0", taxAmount: "0", discountAmount: "0" }] }) };
    if (name === "@/lib/enterprise/retail/invoice-checkout") return { prepareRetailInvoice: async () => { invoiceCreates++; return { invoice: { id: "finance-draft-1", status: "DRAFT" }, idempotent: false }; } };
    throw Error("Unexpected import: " + name);
  },
});
function requireCrypto() { return { createHash: (...args) => cryptoModule.createHash(...args) }; }
const cryptoModule = await import("node:crypto");
const sync = runtimeModule.exports.syncRetailOfflineInvoiceDraft;
const base = {
  organizationId: "org-1", actorUserId: "cashier-1", operationUuid: "11111111-2222-4333-8444-555555555555",
  snapshotVersion: "ofs-test-12345678", siteId: "site-1", warehouseId: "warehouse-1",
  payload: { mode: "INVOICE_DRAFT", siteId: "site-1", warehouseId: "warehouse-1", soldAt: now.toISOString(), currencyCode: "CDF",
    customerBusinessPartyId: null, tenders: [], lines: [{ catalogItemId: "sku-1", quantity: 1, unitPrice: 100, discountAmount: 0, taxAmount: 0 }] },
};
const first = await sync(base);
assert.equal(first.operation.status, "SYNCED");
assert.equal(first.operation.serverEntityType, "EnterpriseSalesInvoice");
assert.equal(first.operation.serverEntityId, "finance-draft-1");
assert.equal(first.invoice.status, "DRAFT");
assert.equal(invoiceCreates, 1);
const retry = await sync(base);
assert.equal(retry.idempotent, true);

await assert.rejects(sync({ ...base, actorUserId: "other-cashier" }), /RETAIL_OFFLINE_UUID_ACTOR_MISMATCH/, "Offline draft cannot be replayed by another actor");
assert.equal(invoiceCreates, 1, "Replay cannot issue a second invoice");
await assert.rejects(sync({ ...base, siteId: "site-2" }), /RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH/, "A UUID cannot be reused across stores");
await assert.rejects(sync({ ...base, snapshotVersion: "ofs-tampered-123456" }), /RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH/, "A UUID cannot be reused across snapshots");
await assert.rejects(sync({ ...base, payload: { ...base.payload, lines: [{ ...base.payload.lines[0], quantity: 2 }] } }), /RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH/, "A UUID cannot be reused with a changed payload");
assert.equal(invoiceCreates, 1, "Changed replay scope or payload must not create Finance invoices");
const modifiedPrice = await sync({ ...base, operationUuid: "11111111-2222-4333-8444-555555555556",
  payload: { ...base.payload, lines: [{ ...base.payload.lines[0], unitPrice: 120 }] } });
assert.equal(modifiedPrice.operation.status, "CONFLICT");
assert.equal(modifiedPrice.operation.conflictCode, "OFFLINE_PRICING_CHANGED");
assert.equal(invoiceCreates, 1);
const paidAttempt = await sync({ ...base, operationUuid: "11111111-2222-4333-8444-555555555557",
  payload: { ...base.payload, tenders: [{ methodType: "CASH", amount: 100 }] } });
assert.equal(paidAttempt.operation.status, "REJECTED");
assert.equal(invoiceCreates, 1, "Offline tender must never create a Finance receipt");
grant = false;
await assert.rejects(sync({ ...base, operationUuid: "11111111-2222-4333-8444-555555555558" }), /REVOKED/);
assert.ok(permissionChecks >= 5, "Cached snapshots must never bypass live permission validation");
console.log("Retail five lots #1116: syntax and offline Finance draft safeguards PASS");
