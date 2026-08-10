import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) { failures.push(`Fichier absent: ${file}`); return ""; }
  return fs.readFileSync(target, "utf8");
};
const requireText = (file, needles) => {
  const content = read(file);
  for (const needle of needles) if (!content.includes(needle)) failures.push(`${file}: contrat absent: ${needle}`);
};
const forbidText = (file, needles) => {
  const content = read(file);
  for (const needle of needles) if (content.includes(needle)) failures.push(`${file}: motif interdit: ${needle}`);
};

requireText("prisma/schema.prisma", ["model ProfessionalToolNote", "professionalToolNotes"]);
requireText("prisma/migrations/20260806110000_iteration_07_e2e_remediation_v3/migration.sql", ["CREATE TABLE \"ProfessionalToolNote\"", "ProfessionalToolNote_userId_fkey"]);
requireText("app/api/toolbox/notes/route.ts", ["isSameOriginRequest", "await rateLimit", "professionalToolNote", "writeAuditLog"]);
requireText("app/api/toolbox/notes/[id]/route.ts", ["userId: session.userId", "archivedAt", "writeAuditLog"]);
requireText("components/productivity/professional-toolbox.tsx", ["RichTextEditor", "NoteView", "Grouping", "ScientificExpressionParser", "calculateFinance", "useFloatingAction"]);
forbidText("components/productivity/professional-toolbox.tsx", ["localStorage", "eval(", "new Function(", "Function(`"]);

// UX v2 #204: the product-scoped loader points to the new implementation while
// the historical component remains intact for rollback and regression evidence.
requireText("components/productivity/product-scoped-professional-toolbox.tsx", [
  "ProductScopedProfessionalToolbox",
  "professional-toolbox-v2",
  "ProfessionalToolboxV2",
  "getCurrentHostType(window.location.host)",
  'hostType === "app"',
  'hostType === "console"',
  'hostType === "support"',
  "ssr: false",
]);
requireText("components/productivity/professional-toolbox-v2.tsx", [
  "ProfessionalToolboxV2",
  "metadataSession",
  "editorSession",
  "Valider et éditer",
  "ProfessionalNoteRichEditor",
  "ProfessionalCalculatorV2",
  "RichNotePreview",
  "dangerouslySetInnerHTML",
  "returnToMetadata",
  "saveEditorSession",
]);
forbidText("components/productivity/professional-toolbox-v2.tsx", ["localStorage", "eval(", "new Function(", "Function(`"]);
requireText("components/productivity/professional-note-rich-editor.tsx", [
  "ProfessionalNoteEditorHandle",
  "contentEditable",
  "min-w-max flex-nowrap",
  "scheduleCaretVisibility",
  "editor.scrollTop",
  "event.preventDefault()",
  "selectionRef",
  "restoreSelection",
]);
requireText("components/productivity/professional-calculator-v2.tsx", [
  "ProfessionalCalculatorV2",
  "SafeExpressionParser",
  "FINANCIAL_FORMULAS",
  'id: "npv"',
  'id: "break-even"',
  'id: "effective-rate"',
  'id: "cagr"',
  "Financial assistant",
  "Assistant financier",
]);
forbidText("components/productivity/professional-calculator-v2.tsx", ["eval(", "new Function(", "Function(`"]);

requireText("components/activities/work-prestations-panel-v2.tsx", ["weeklyGrouping", '"workType"', '"locationMode"', "EntityCommentsThread"]);
requireText("components/activities/entity-comments-thread.tsx", ["WORK_ENTRY", "WORK_SUBMISSION", "/api/activities/comments"]);
requireText("app/api/activities/comments/route.ts", ["WORK_ENTRY", "WORK_SUBMISSION", "reviewerEmployeeId"]);
requireText("lib/operational-progress.ts", ["calculateDerivedOperationalProgress", "validateOperationalClosure", "syncDerivedOperationalProgress", "openLinkedTasks"]);
requireText("app/api/activities/status-transitions/[entityType]/[id]/route.ts", ["validateOperationalClosure", "syncDerivedOperationalProgress"]);
requireText("app/api/operations/checklists/route.ts", ["syncDerivedOperationalProgress"]);
forbidText("lib/validators.ts", ["progress: z.coerce.number().int().min(0).max(100).optional()"]);

requireText("components/floating-actions/floating-action-hub.tsx", [
  "FloatingActionHubProvider",
  "useFloatingAction",
  "Actions rapides",
  "safe-area-inset-bottom",
  "const registry = useMemo<FloatingActionRegistry>",
  "isFloatingActionHostEnabled",
  "getCurrentHostType(window.location.host)",
  'hostType === "app"',
  'hostType === "console"',
  'hostType === "support"',
  "SCROLL_DIRECTION_THRESHOLD",
  "isRelevantWorkspaceScroll",
  "data-floating-action-hub-visible",
  "delta < 0",
  "setVisible(false)",
  "setVisible(true)",
]);
forbidText("components/floating-actions/floating-action-hub.tsx", ["<FloatingActionContext.Provider value={{ register }}>"]);
requireText("app/layout.tsx", ["FloatingActionHubProvider", "ProductScopedProfessionalToolbox"]);
forbidText("app/layout.tsx", ['import { ProfessionalToolbox } from "@/components/productivity/professional-toolbox"', "<ProfessionalToolbox />"]);
requireText("components/user-guides/standard-module-fallback-guide.tsx", ["useFloatingAction", "hideTrigger"]);

requireText("lib/billing.ts", ["billing-plans.bootstrap.json", "createMany"]);
requireText("lib/billing/ai-usage-limits.ts", ["getCanonicalAiUsageLimits", "ORGANIZATION_SUBSCRIPTION", "PERSONAL_SUBSCRIPTION"]);
requireText("lib/billing/entitlements.ts", ["resolveOrganizationUsageLimits", "dailyMessageLimit", "maxEnterpriseAiMonthlyTokens"]);
requireText("components/admin/billing-plan-manager.tsx", ["Offres individuelles", "Offres d’organisation", "offerGroup.code", "audienceCode"]);
requireText("app/api/chat/route.ts", ["getCanonicalAiUsageLimits"]);
requireText("app/api/chat/v2/route.ts", ["getCanonicalAiUsageLimits"]);

requireText("lib/standard-collaboration.ts", ["getAcceptedCollaborationContacts", "contactSince"]);
requireText("components/collaborators/collaborators-conversation-workspace.tsx", ["initialContacts", "Mes contacts", "historyExpandedRef", "previousHeight"]);
requireText("app/api/collaborators/contact-requests/route.ts", ["ADMIN DTSC", "session.role === UserRole.ADMIN"]);

requireText("scripts/audit-user-guide-contract.mjs", ["Contrat de guide DTSC v2", "PROFESSIONAL_TOOLBOX.md"]);
requireText("scripts/audit-iteration-07-i18n-contract.mjs", ["i18n-hardcoded-baseline.json", "bilingualContracts"]);
requireText(".github/workflows/quality-gates.yml", ["User guide contract QA", "Iteration 07 i18n contract QA", "Iteration 07 owner E2E remediation v3 QA"]);
requireText("docs/user-guides/PROFESSIONAL_TOOLBOX.md", ["plusieurs notes", "Kanban", "Scientifique", "Financière", "plein écran", "VAN", "seuil de rentabilité"]);

if (fs.existsSync(path.join(root, ".github/workflows/export-source-artifact.yml"))) failures.push("Le workflow temporaire d’export source doit être retiré avant fusion.");

if (failures.length) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✓ Correctifs E2E propriétaire v3 + UX boîte à outils #204 couverts");
