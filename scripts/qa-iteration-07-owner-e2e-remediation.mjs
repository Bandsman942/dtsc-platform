import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
function read(file) { const target = path.join(root, file); if (!fs.existsSync(target)) { failures.push(`Fichier absent: ${file}`); return ""; } return fs.readFileSync(target, "utf8"); }
function requireText(file, needles) { const content = read(file); for (const needle of needles) if (!content.includes(needle)) failures.push(`${file}: contrat absent: ${needle}`); }
function forbidText(file, needles) { const content = read(file); for (const needle of needles) if (content.includes(needle)) failures.push(`${file}: motif interdit: ${needle}`); }

requireText("app/layout.tsx", ["ProfessionalToolbox", "<ProfessionalToolbox />"]);
requireText("components/productivity/professional-toolbox.tsx", ["dtsc:professional-toolbox:v1", "evaluateArithmetic", "localStorage", "Pense-bête"]);
forbidText("components/productivity/professional-toolbox.tsx", ["eval(", "new Function("]);

requireText("components/activities/activities-dashboard-v3.tsx", ["list", "kanban", "buildColumns", "status-transitions"]);
requireText("components/activities/work-prestations-panel-v2.tsx", ["groupEntriesByLocation", "groupSubmissionsByStatus", "SubmissionHistoryKanban", "WorkEntryKanban"]);
requireText("lib/activity-status-workflow.ts", ["ACTIVITY_STATUS_TRANSITIONS", "ACTIVITY_STATUS_REASON_REQUIRED", "getActivityStatusTransitions"]);
requireText("app/api/activities/status-transitions/[entityType]/[id]/route.ts", ["isSameOriginRequest", "await rateLimit", "updateMany", "operationalStatusTransition.create", "synchronizedAdminSection", "CONCURRENT_UPDATE"]);

requireText("prisma/schema.prisma", ["model CollaborationContactRequest", "model ManualSubscriptionPayment", "audience", "manualPaymentId", "category"]);
requireText("prisma/migrations/20260805234500_iteration_07_e2e_remediation/migration.sql", ["CollaborationContactRequest", "ManualSubscriptionPayment", "BillingPlanVersion", "Invoice_organizationSubscriptionId_fkey", "HR_CFO_TRANSACTION"]);
requireText("app/api/collaborators/contact-directory/route.ts", ["publicProfileConsent", "collaborationUserBlock", "rateLimit"]);
requireText("app/api/collaborators/contact-requests/route.ts", ["isSameOriginRequest", "idempotencyKey", "CollaborationContactRequest"]);
requireText("app/api/collaborators/contact-requests/[id]/route.ts", ["updateMany", "resolveDirectConversation", "unchanged"]);
requireText("components/collaborators/collaborators-conversation-workspace.tsx", ["GroupCallRoom", "activeCall", "Dialog", "contact-requests"]);
forbidText("components/collaborators/collaborators-conversation-workspace.tsx", ["<CollaboratorsWorkspace"]);

requireText("app/api/billing/organization-checkout/route.ts", ["requestId", "createHash", "PENDING_PAYMENT", "PaymentStatus.FAILED", "organizationSubscription"]);
forbidText("app/api/billing/organization-checkout/route.ts", ["buildPaymentReference("]);
requireText("app/api/admin/manual-subscription-payments/route.ts", ["requestId", "SEPARATION_OF_DUTIES", "idempotencyKey", "SUBSCRIPTIONS_MANAGE"]);
requireText("lib/subscription-payments.ts", ["activateOrganizationSubscriptionFromPayment", "finalizeManualSubscriptionPayment", "createValidatedTransaction", "sendInvoiceEmail"]);
requireText("lib/console/console-capabilities.ts", ["HR_CFO_INVOICES_READ"]);
requireText("app/api/invoices/[id]/pdf/route.ts", ["HR_CFO_INVOICES_READ", "HR_CFO_TRANSACTION"]);
requireText("components/admin/hrcfo-invoice-list.tsx", ["HR/CFO", "permission Console HR/CFO"]);

requireText("docs/STANDARD_MODULE_ITERATION_07_OWNER_E2E_REMEDIATION.md", ["aucune promotion automatique", "idempotente", "20260805234500_iteration_07_e2e_remediation"]);
requireText("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_07_OWNER_REMEDIATION.md", ["NON_EXÉCUTÉ", "COMMERCIAL_READY"]);

const registry = read("lib/modules/standard-module-registry-data.json");
if (/\"maturity\"\s*:\s*\"COMMERCIAL_READY\"/.test(registry) && !registry.includes("COLLABORATORS")) failures.push("Promotion commerciale non justifiée détectée.");

if (failures.length) { console.error(failures.map((failure) => `✗ ${failure}`).join("\n")); process.exit(1); }
console.log("✓ Correctifs E2E propriétaire de l’itération 07 couverts");
