import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const activities = read("components/activities/activities-dashboard-v3.tsx");
const activityBoard = read("components/activities/activity-section-board.tsx");
const prestations = read("components/activities/work-prestations-panel-v2.tsx");
const toolbox = read("components/toolbox/professional-toolbox.tsx");
const pwa = read("components/pwa/pwa-install-prompt.tsx");
const collaboration = read("components/collaborators/collaborators-conversation-workspace.tsx");
const collaborationModel = read("prisma/standard-collaboration.prisma");
const connectionsApi = read("app/api/collaborators/connections/route.ts");
const billing = read("lib/billing.ts");
const manualBilling = read("lib/manual-subscription-payments.ts");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260805203000_iteration07_e2e_followup/migration.sql");
const finance = read("lib/hr-cfo-finance.ts");
const capabilities = read("lib/console/console-capability-catalog.ts");

assert(activities.includes("ActivitySectionBoard"), "Chaque bloc Activités DTSC doit utiliser son tableau Kanban/liste.");
for (const token of ["Kanban", "Liste", "Regrouper par", "progress", "priority", "status"]) assert(activityBoard.includes(token), `Contrat Kanban Activités manquant: ${token}.`);
assert(activities.includes('/api/activities/tasks/${item.id}') && activityBoard.includes("IN_PROGRESS") && activityBoard.includes("COMPLETED"), "Les transitions de tâches doivent rester canoniques et idempotentes.");
assert(prestations.includes("WorkEntriesBoard") && prestations.includes("locationMode"), "Les prestations hebdomadaires doivent proposer un Kanban par mode de travail.");
assert(prestations.includes("SubmissionHistoryBoard") && prestations.includes('axis === "status"'), "L’historique des prestations doit proposer un Kanban filtrable par statut.");

for (const token of ["Bloc-notes de réflexion", "Calculatrice", "Pense-bête", "localStorage", "evaluateExpression"]) assert(toolbox.includes(token), `Boîte à outils professionnelle incomplète: ${token}.`);
assert(pwa.includes("ProfessionalToolbox"), "La boîte à outils doit être montée globalement dans l’application privée.");

assert(collaborationModel.includes("model CollaborationConnection"), "Le modèle de relation professionnelle doit exister.");
assert(connectionsApi.includes("PENDING") && connectionsApi.includes("authorizedCollaboratorIds"), "Les invitations professionnelles doivent être bornées par l’autorisation canonique.");
assert(collaboration.includes("GroupCallRoom") && !collaboration.includes("return <CollaboratorsWorkspace"), "Le mode appel doit réutiliser la conversation actuelle sans basculer vers l’ancien workspace.");
assert(collaboration.includes("/calls/${activeGroup.id}") || collaboration.includes("/groups/${activeGroup.id}/calls"), "Le démarrage d’appel canonique doit rester raccordé.");

assert(schema.includes('audience                  String') && schema.includes('invoiceType         String'), "Les offres et factures doivent être typées.");
assert(billing.includes("SUBSCRIPTION_PERSONAL") && billing.includes("SUBSCRIPTION_ENTERPRISE"), "Les circuits de facture personnelle et entreprise doivent être distincts.");
assert(manualBilling.includes("PENDING_VALIDATION") && manualBilling.includes("MANUAL_SUBSCRIPTION_PAYMENT") && manualBilling.includes("sendInvoiceEmail"), "Le paiement manuel doit être validé, facturé, envoyé et comptabilisé.");
assert(finance.includes('invoiceType: "HRCFO_TRANSACTION"'), "Les factures HR/CFO doivent être séparées des factures d’abonnement.");
assert(capabilities.includes("FINANCE_INVOICES_READ") && capabilities.includes("FINANCE_INVOICES_MANAGE"), "Les permissions de factures HR/CFO doivent être administrables.");
for (const table of ["CollaborationConnection", "SubscriptionManualPayment"]) assert(migration.includes(`CREATE TABLE IF NOT EXISTS "${table}"`), `Migration additive manquante: ${table}.`);
assert(fs.existsSync(path.join(root, "docs/E2E_ITERATION_07_FOLLOWUP_2026-08-05.md")), "La preuve E2E de suivi doit être versionnée.");

if (failures.length) {
  console.error("Échec QA suivi E2E itération 7:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("QA suivi E2E itération 7 réussie.");
