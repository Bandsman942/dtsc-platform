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
const assets = read("lib/enterprise/accounting/asset-accounting-service.ts");
const expenses = read("lib/enterprise/accounting/payroll-expense-accounting-service.ts");
const retail = read("lib/enterprise/retail/accounting.ts");

requireText("inventory", inventory, 'import { postBusinessEventTx }', "la valorisation stock doit utiliser la primitive Tx");
forbidText("inventory", inventory, "postBusinessEvent(", "la valorisation stock ne doit plus poster hors transaction");
for (const event of ["INVENTORY_RECEIPT_VALUED", "INVENTORY_ISSUE_VALUED"]) {
  requireText("inventory", inventory, `postingEvent: "${event}"`, `${event} doit rester enregistré dans le moteur canonique`);
}
requireText("inventory", inventory, 'data: { status: "POSTED", journalEntryId: posting.entry.id }', "l'event stock doit devenir POSTED dans la même transaction");
requireText("inventory", inventory, "TransactionIsolationLevel.Serializable", "les valorisations doivent rester sérialisables");

const profile = functionSlice(assets, "export async function createAssetAccountingProfile", "export async function postAssetDepreciation");
const depreciation = functionSlice(assets, "export async function postAssetDepreciation", "export async function runDueAssetDepreciation");
for (const [label, fn, event] of [
  ["asset profile", profile, "ASSET_CAPITALIZED"],
  ["asset depreciation", depreciation, "ASSET_DEPRECIATION_POSTED"],
]) {
  requireText(label, fn, "postBusinessEventTx(tx", "le posting doit appartenir à la transaction métier");
  requireText(label, fn, `postingEvent: "${event}"`, "l'événement canonique doit être conservé");
  forbidText(label, fn, "postBusinessEvent(", "aucun posting hors transaction n'est autorisé");
}
requireText("asset depreciation", depreciation, "organizationId_depreciationScheduleId", "la reprise d'amortissement doit rester idempotente");
requireText("asset depreciation", depreciation, '["PLANNED", "APPROVED"]', "les anciens schedules APPROVED doivent rester récupérables");

const expense = functionSlice(expenses, "export async function classifyAndPostExpense", "export async function postApprovedClientPayroll");
requireText("expense", expense, "postBusinessEventTx(tx", "classification et posting dépense doivent partager la transaction");
requireText("expense", expense, 'accountedAt: new Date()', "la finalisation comptable doit être dans la transaction");
forbidText("expense", expense, "postBusinessEvent(", "la dépense ne doit plus poster hors transaction");

const retailReturn = functionSlice(retail, "export async function valueRetailInventoryReturn", "export async function finalizeRetailReturnAccounting");
requireText("retail return", retailReturn, "postBusinessEventTx(tx", "la couche de retour et son posting doivent être atomiques");
requireText("retail return", retailReturn, "if (!event)", "un event historique existant ne doit pas recréer la couche stock");
forbidText("retail return", retailReturn, "postBusinessEvent(", "le posting du retour stock ne doit plus être séparé");

console.log("PASS: Accounting #622 atomicité stock, dépenses et immobilisations");
