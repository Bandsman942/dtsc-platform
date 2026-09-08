import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(label, source, text, message) {
  if (!source.includes(text)) {
    console.error(`FAIL #602 ${label}: ${message}`);
    process.exit(1);
  }
}

function forbidText(label, source, text, message) {
  if (source.includes(text)) {
    console.error(`FAIL #602 ${label}: ${message}`);
    process.exit(1);
  }
}

function functionBlock(source, start, next) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(next, startIndex + start.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

const posting = read("lib/enterprise/accounting/posting-service.ts");
const provisioning = read("lib/enterprise/accounting/mobile-money-ledger-provisioning.ts");
const retailService = read("lib/enterprise/retail/service.ts");
const fxService = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
const mobileRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts");
const fxRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/fx/route.ts");
const telcoRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts");
const operatorOrchestration = read("lib/enterprise/retail/operator-orchestration.ts");

requireText("posting", posting, "export async function postBusinessEventTx(", "la primitive transaction-aware manque");
requireText("posting", posting, "pg_advisory_xact_lock", "l'advisory lock canonique doit rester dans la primitive Tx");
requireText("posting", posting, "getPostingBuilderV2", "le registre canonique de posting doit rester utilisé");
requireText("posting", posting, "status: \"POSTED\"", "les écritures créées doivent rester POSTED");
requireText("posting", posting, "(tx) => postBusinessEventTx(tx, organizationId, actorUserId, input)", "le wrapper historique doit déléguer à la primitive Tx");

const postingTx = functionBlock(posting, "export async function postBusinessEventTx(", "async function recordPostingFailure(");
forbidText("posting", postingTx, "prisma.$transaction", "postBusinessEventTx ne doit jamais ouvrir une transaction imbriquée");

requireText("provisioning", provisioning, "export async function ensureMobileMoneyTransactionLedgerMappingTx(", "le mapping wallet Mobile Money doit être réutilisable dans la transaction métier");
requireText("provisioning", provisioning, "export async function ensureMobileMoneyFxLedgerMappingsTx(", "les mappings wallet FX doivent être réutilisables dans la transaction métier");
requireText("provisioning", provisioning, "(tx) => ensureMobileMoneyTransactionLedgerMappingTx(tx, organizationId, actorUserId, transactionId)", "le wrapper Mobile Money historique doit déléguer à la primitive Tx");
requireText("provisioning", provisioning, "(tx) => ensureMobileMoneyFxLedgerMappingsTx(tx, organizationId, actorUserId, transferId)", "le wrapper FX historique doit déléguer à la primitive Tx");

requireText("retail service", retailService, "async function createMobileMoneyTransactionTx(", "le cœur Mobile Money doit accepter un TransactionClient");
requireText("retail service", retailService, "export async function createMobileMoneyTransactionWithPosting(", "le wrapper atomique Mobile Money manque");
requireText("retail service", retailService, "await ensureMobileMoneyTransactionLedgerMappingTx(tx", "le provisioning Mobile Money doit se faire dans la même transaction");
requireText("retail service", retailService, 'postingEvent: "RETAIL_MOBILE_MONEY_POSTED"', "le posting Mobile Money canonique manque");
requireText("retail service", retailService, "async function createTelcoTopupTx(", "le cœur Telco doit accepter un TransactionClient");
requireText("retail service", retailService, "export async function createTelcoTopupWithPosting(", "le wrapper atomique Telco manque");
requireText("retail service", retailService, 'postingEvent: "RETAIL_TELCO_TOPUP_POSTED"', "le posting Telco canonique manque");
requireText("retail service", retailService, "export async function createMobileMoneyTransaction(", "le wrapper legacy Mobile Money doit rester pour les parcours provider/historiques");
requireText("retail service", retailService, "export async function createTelcoTopup(", "le wrapper legacy Telco doit rester pour les parcours provider/historiques");

requireText("FX service", fxService, "async function createMobileMoneyFxTransferTx(", "le cœur FX doit accepter un TransactionClient");
requireText("FX service", fxService, "export async function createMobileMoneyFxTransferWithPosting(", "le wrapper atomique FX manque");
requireText("FX service", fxService, "await ensureMobileMoneyFxLedgerMappingsTx(tx", "le provisioning FX doit rester dans la même transaction");
requireText("FX service", fxService, 'postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED"', "le posting FX canonique manque");
requireText("FX service", fxService, "export async function createMobileMoneyFxTransfer(", "le wrapper legacy FX doit rester pour la reprise historique");

requireText("Mobile Money route", mobileRoute, "createMobileMoneyTransactionWithPosting", "la création manuelle doit utiliser le wrapper atomique");
forbidText("Mobile Money route", mobileRoute, "finalizeMobileMoneyAccounting", "la route manuelle ne doit plus finaliser la comptabilité dans une seconde transaction");
forbidText("Mobile Money route", mobileRoute, "ENTERPRISE_MOBILE_MONEY_ACCOUNTING_PENDING", "un nouveau Mobile Money manuel ne doit plus être confirmé avec comptabilité PENDING");
forbidText("Mobile Money route", mobileRoute, 'retailPendingOutcome("RETAIL_ACCOUNTING_PENDING"', "un échec comptable atomique doit rollback au lieu de renvoyer PENDING");

requireText("FX route", fxRoute, "createMobileMoneyFxTransferWithPosting", "la création FX doit utiliser le wrapper atomique");
forbidText("FX route", fxRoute, "finalizeMobileMoneyFxAccounting", "la route FX ne doit plus poster dans une seconde transaction");
forbidText("FX route", fxRoute, "retailAccountingPendingDiagnostic", "un nouveau transfert FX ne doit plus produire un diagnostic PENDING après commit métier");
forbidText("FX route", fxRoute, "ACCOUNTING_PENDING", "un nouveau transfert FX ne doit plus être confirmé avec comptabilité PENDING");

requireText("Telco route", telcoRoute, "createTelcoTopupWithPosting", "la recharge manuelle doit utiliser le wrapper atomique");
forbidText("Telco route", telcoRoute, "finalizeTelcoTopupAccounting", "la route Telco manuelle ne doit plus poster dans une seconde transaction");
forbidText("Telco route", telcoRoute, "ENTERPRISE_TELCO_TOPUP_ACCOUNTING_PENDING", "une nouvelle recharge SUCCESS ne doit plus rester comptablement PENDING");
forbidText("Telco route", telcoRoute, 'retailPendingOutcome("RETAIL_ACCOUNTING_PENDING"', "un échec comptable Telco atomique doit rollback");

requireText("provider compatibility", operatorOrchestration, "createMobileMoneyTransaction", "le parcours provider Mobile Money historique doit rester disponible dans ce sous-lot");
requireText("provider compatibility", operatorOrchestration, "finalizeMobileMoneyAccounting", "le cutover provider Mobile Money est explicitement hors scope #602");
requireText("provider compatibility", operatorOrchestration, "createTelcoTopup", "le parcours provider Telco historique doit rester disponible dans ce sous-lot");
requireText("provider compatibility", operatorOrchestration, "finalizeTelcoTopupAccounting", "le cutover provider Telco est explicitement hors scope #602");

console.log("PASS #602 atomic Retail posting contract");
