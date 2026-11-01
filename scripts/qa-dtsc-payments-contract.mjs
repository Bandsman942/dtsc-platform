import { existsSync, readFileSync, readdirSync } from "node:fs";

const errors = [];
const read = (path) => {
  if (!existsSync(path)) {
    errors.push(`Fichier manquant : ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
};
const requireTerms = (source, terms, label) => {
  for (const term of terms) {
    if (!source.includes(term)) errors.push(`${label} : référence attendue absente (${term})`);
  }
};
const requirePattern = (source, pattern, label) => {
  if (!pattern.test(source)) errors.push(`${label} : contrat attendu non trouvé (${pattern})`);
};

const architecture = read("docs/DTSC_PAYMENTS_ARCHITECTURE.md");
const contributing = read("docs/CONTRIBUTING.md");
const agents = read("AGENTS.md");
const schema = read("prisma/schema.prisma");
const erpSchema = read("prisma/enterprise-accounting.prisma");
const manualService = read("lib/subscription-payments.ts");
const erpPaymentService = read("lib/enterprise/accounting/payments-service.ts");
const webhook = read("app/api/billing/maishapay/callback/route.ts");

requireTerms(contributing, ["dernier `main`", "OWNER_E2E", "Matrice de preuves"], "CONTRIBUTING");
requireTerms(agents, ["Une seule source de vérité", "tenant", "POSTED"], "AGENTS");

requireTerms(architecture, [
  "Conformité contribution / AGENTS",
  "Frontières et sources de vérité réelles",
  "Machine d'état et traduction entre domaines",
  "Rôles, scopes et séparation des responsabilités",
  "Contrats de preuve, idempotence et impact financier",
  "Provider framework et MaishaPay",
  "Carte des routes",
  "Cutover sectoriel sans double source",
  "Backlog de schéma, services et composants",
  "Matrice de conformité PAY-0 à PAY-9",
  "Plan de vérification et critères de sortie PAY-0",
  "docs/CONTRIBUTING.md",
  "docs/DELIVERY_GOVERNANCE.md",
  "aucune migration PAY-0",
  "OWNER_E2E",
  "--dry-run",
  "FR/EN",
  "multi-tenant",
  "PAY-1",
  "PAY-9",
], "architecture PAY-0");

for (let index = 0; index < 10; index += 1) {
  requireTerms(architecture, [`PAY-${index}`], `phase PAY-${index}`);
}

for (const model of ["BillingPlan", "Subscription", "OrganizationSubscription", "Invoice", "Payment", "ManualSubscriptionPayment", "FinancialAccount", "HrcfoExpense", "WebhookEvent"]) {
  requirePattern(schema, new RegExp(`^model ${model} \\{`, "m"), `modèle SaaS/interne ${model}`);
  requireTerms(architecture, [model], `cartographie ${model}`);
}

for (const model of ["EnterprisePayment", "EnterprisePaymentAllocation", "EnterpriseSalesInvoice", "EnterpriseReceivable", "EnterpriseFinancialAccount", "EnterpriseJournalEntry", "EnterprisePostingBatch"]) {
  requirePattern(erpSchema, new RegExp(`^model ${model} \\{`, "m"), `modèle ERP ${model}`);
  requireTerms(architecture, [model], `cartographie ERP ${model}`);
}

requirePattern(schema, /enum PaymentStatus \{[\s\S]*?PENDING[\s\S]*?ACCEPTED[\s\S]*?PAID[\s\S]*?FAILED[\s\S]*?CANCELED\s*\}/, "statuts Payment SaaS");
requireTerms(manualService, ["MANUAL_PAYMENT_SELF_APPROVAL_FORBIDDEN", "createValidatedTransactionInTx", "finalizePersonalManualPayment", "finalizeOrganizationManualPayment"], "service manuel existant");
requireTerms(erpPaymentService, ["EnterprisePayment", "enterprisePaymentAllocation", "assertIndependentActor", "reverseJournalEntryTx"], "service paiement ERP existant");
requireTerms(webhook, ["MAISHAPAY_CALLBACK_SECRET", "processStoredWebhookEvent"], "callback MaishaPay");
requireTerms(architecture, ["MAISHAPAY_CALLBACK_SECRET", "montant", "devise", "signature", "aucun `PaymentAllocation` SaaS", "nouvelle table principale `DtscPayment`"], "garde-fous PSP/Finance");

for (const source of [schema, erpSchema, ...readdirSync("prisma").filter((file) => file.endsWith(".prisma") && !["schema.prisma", "enterprise-accounting.prisma"].includes(file)).map((file) => read(`prisma/${file}`))]) {
  if (/^model DtscPayment\s*\{/m.test(source)) errors.push("Le modèle parallèle DtscPayment est interdit");
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`FAIL ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("PASS PAY-0 DTSC Payments : cartographie, contribution, données et garde-fous documentaires.\n");
}
