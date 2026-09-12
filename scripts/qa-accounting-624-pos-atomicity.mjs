import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1); };
const requireText = (label, text, token, message) => { if (!text.includes(token)) fail(`${label}: ${message}`); };
const forbidText = (label, text, token, message) => { if (text.includes(token)) fail(`${label}: ${message}`); };

function functionSlice(text, startToken, endToken) {
  const start = text.indexOf(startToken);
  if (start < 0) fail(`fonction introuvable: ${startToken}`);
  const end = endToken ? text.indexOf(endToken, start + startToken.length) : text.length;
  return text.slice(start, end < 0 ? text.length : end);
}

const inventory = read("lib/enterprise/accounting/inventory-accounting-service.ts");
const accounting = read("lib/enterprise/retail/accounting.ts");
const service = read("lib/enterprise/retail/service.ts");
const returns = read("lib/enterprise/retail/returns.ts");
const saleExecution = read("lib/enterprise/retail/sale-execution.ts");
const offline = read("lib/enterprise/retail/offline-server.ts");

requireText("inventory", inventory, "export async function valueInventoryIssueTx(", "la valorisation sortie doit exposer une primitive TransactionClient");
const issueTx = functionSlice(inventory, "export async function valueInventoryIssueTx(", "export async function valueInventoryIssue(");
requireText("inventory issue tx", issueTx, "postBusinessEventTx(tx", "la valorisation et son posting doivent partager la transaction appelante");
forbidText("inventory issue tx", issueTx, "prisma.$transaction", "la primitive Tx ne doit jamais ouvrir une transaction imbriquée");

for (const [name, next] of [
  ["finalizeRetailSaleAccountingTx", "export async function finalizeRetailSaleAccounting("],
  ["valueRetailInventoryReturnTx", "export async function valueRetailInventoryReturn("],
  ["finalizeRetailReturnAccountingTx", "export async function finalizeRetailReturnAccounting("],
  ["finalizeRetailSaleReversalAccountingTx", "export async function finalizeRetailSaleReversalAccounting("],
]) {
  const block = functionSlice(accounting, `export async function ${name}(`, next);
  requireText(name, block, "postBusinessEventTx(tx", "le posting canonique doit rester dans la transaction appelante");
  forbidText(name, block, "prisma.$transaction", "aucune transaction Prisma imbriquée n'est autorisée");
}
requireText("sale accounting tx", accounting, "valueInventoryIssueTx(tx", "la sortie stock POS doit être valorisée dans la même transaction");
requireText("return accounting tx", accounting, "valueRetailInventoryReturnTx(tx", "le restock retour doit être valorisé dans la même transaction");
requireText("historical return recovery", accounting, "await finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, retailReturn.saleId)", "un retour historique doit pouvoir achever le posting de sa vente sans rejouer le métier");

const saleBlock = functionSlice(service, "export async function createRetailSale(", "export async function reverseRetailSale(");
requireText("sale", saleBlock, "prisma.$transaction", "la vente doit rester dans une transaction sérialisable");
requireText("sale", saleBlock, "await finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, sale.id)", "la nouvelle vente doit poster avant COMMIT");
requireText("sale retry", saleBlock, "await finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, existing.id)", "un ticket historique/idempotent doit achever son accounting sans recréer le ticket");
requireText("sale", saleBlock, 'movementType: "SALE_FULFILLMENT"', "le mouvement stock doit rester dans la même transaction");
requireText("sale", saleBlock, 'transactionType: "RETAIL_POS_SALE"', "les tenders doivent rester dans la même transaction");

const reversalBlock = functionSlice(service, "export async function reverseRetailSale(", "async function getRetailProviderTx");
requireText("reversal", reversalBlock, "await finalizeRetailSaleReversalAccountingTx(tx, organizationId, actorUserId, sale.id)", "l'annulation doit poster et valoriser avant COMMIT");
requireText("reversal", reversalBlock, 'movementType: "RETURN_IN"', "l'annulation doit conserver son retour stock transactionnel");
requireText("reversal", reversalBlock, 'transactionType: "RETAIL_POS_REVERSAL"', "le reversal des tenders doit partager la transaction");
requireText("reversal retry", reversalBlock, 'if (sale.status === "REVERSED")', "un reversal historique doit être récupérable sans rejouer les effets métier");

const returnDecision = functionSlice(returns, "export async function decideRetailReturn(", null);
requireText("return decision", returnDecision, "await finalizeRetailReturnAccountingTx(tx, organizationId, actorUserId, completed.id)", "retour + remboursement + posting doivent committer ensemble");
requireText("return retry", returnDecision, "await finalizeRetailReturnAccountingTx(tx, organizationId, actorUserId, retailReturn.id)", "un retour COMPLETED historique doit achever son accounting idempotemment");
requireText("return decision", returnDecision, "applyRefundAccountEffectTx(tx", "le remboursement doit rester dans la transaction métier");
requireText("return decision", returnDecision, "applyStockMovementTx(tx", "le restock doit rester dans la transaction métier");

requireText("canonical sale", saleExecution, "createRetailSale(args.organizationId", "online POS doit toujours utiliser la vente canonique rendue atomique");
requireText("offline", offline, "executeCanonicalRetailSale", "le replay offline doit conserver le même chemin canonique atomique");
requireText("offline", offline, "idempotencyKey: `offline:${args.operationUuid}`", "le replay offline doit conserver sa clé stable");

console.log("PASS: Accounting #624 POS sale/return/reversal atomicity");
