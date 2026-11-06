import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ui = read("components/admin/manual-subscription-payments-admin.tsx");
const api = read("app/api/admin/manual-subscription-payments/route.ts");
const decisionApi = read("app/api/admin/manual-subscription-payments/[id]/route.ts");

for (const token of [
  "data-manual-payment-workspace",
  "BusinessListItem",
  "ContextActions",
  "FullscreenEntityDetail",
  "BusinessDetailField",
  "ListControls",
  "overflow-x-auto",
  "min-w-0",
  "whitespace-nowrap",
  "statusFilters.map",
  'type="date"',
  "onPageChange={setPage}",
  'onOpen={() => setSelectedRequest(item)}',
  'item.validatorUserId === currentUserId',
  'action: "APPROVE"',
  'action: "REJECT"',
  "selectedRequest.externalReference",
]) assert.ok(ui.includes(token), `La fiche mobile doit conserver : ${token}`);

assert.ok(!ui.includes('flex flex-wrap items-start gap-3"'), "La fiche ne doit plus juxtaposer le nom et les boutons larges.");
assert.ok(!ui.includes('"flex gap-2"><Button'), "Les boutons de décision ne doivent plus partager la ligne du titre.");

for (const token of [
  "listSchema.safeParse",
  "isoDateSchema",
  "search: z.string().trim().max(120)",
  'status: z.enum(["PENDING_VALIDATION", "APPROVED", "REJECTED"])',
  "prisma.manualSubscriptionPayment.count",
  "prisma.manualSubscriptionPayment.groupBy",
  "skip: (page - 1) * pageSize, take: pageSize",
  "pagination: { page, pageSize, pageCount, total }",
  "statusCounts",
  "validatorUserId: session.userId",
  "assignedOnly",
  "!search && !status && !from && !to",
]) assert.ok(api.includes(token), `La liste filtrée doit conserver : ${token}`);

assert.ok(decisionApi.includes("finalizeManualSubscriptionPayment"), "La décision doit garder la comptabilisation transactionnelle existante.");
assert.ok(decisionApi.includes("isSameOriginRequest(req)"), "La décision doit garder la vérification d'origine.");
console.log("✅ Hotfix paiements manuels : liste mobile compacte, fiche plein écran, filtres paginés et périmètre validateur vérifiés.");
