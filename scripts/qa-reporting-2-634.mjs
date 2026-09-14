import fs from "node:fs";
import process from "node:process";

const failures = [];

function read(path) {
  if (!fs.existsSync(path)) {
    failures.push(`Fichier introuvable: ${path}`);
    return "";
  }
  return fs.readFileSync(path, "utf8");
}

function expect(path, source, pattern, label) {
  const ok = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (!ok) failures.push(`${path}: contrat absent — ${label}`);
}

function forbid(path, source, pattern, label) {
  const hit = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (hit) failures.push(`${path}: interdit — ${label}`);
}

const servicePath = "lib/enterprise/finance/report-service.ts";
const service = read(servicePath);
expect(servicePath, service, "reportHasUsableData", "garde serveur contre les rapports sans données");
expect(servicePath, service, '"REPORT_NO_DATA"', "erreur métier explicite sans persistance vide");
expect(servicePath, service, "validateReportReferences", "validation serveur des références de filtre");
expect(servicePath, service, "organizationId", "scoping tenant des références et agrégats");
expect(servicePath, service, "deepLink", "deep-link persisté dans le snapshot autorisé");

const optionsPath = "app/api/enterprise/[organizationId]/reports/options/route.ts";
const options = read(optionsPath);
expect(optionsPath, options, "getEnterpriseFinanceAccess", "accès REPORTS obligatoire pour les options");
expect(optionsPath, options, "enterpriseBudgetVisibilityWhere", "budgets filtrés selon la visibilité de l’utilisateur");
for (const marker of ["organizationId, isActive: true", "organizationId, archivedAt: null", "resolveEnterpriseModuleCapabilities"]) {
  expect(optionsPath, options, marker, `options tenant-scoped: ${marker}`);
}

const scheduleRoutePath = "app/api/enterprise/[organizationId]/reports/schedules/route.ts";
const scheduleRoute = read(scheduleRoutePath);
expect(scheduleRoutePath, scheduleRoute, 'moduleCode: "REPORTS", action: "manage"', "lecture et création réservées aux gestionnaires REPORTS");
expect(scheduleRoutePath, scheduleRoute, "isSameOriginRequest", "same-origin sur mutation de planification");
expect(scheduleRoutePath, scheduleRoute, "rateLimit", "rate-limit sur mutation de planification");
expect(scheduleRoutePath, scheduleRoute, "writeAuditLog", "audit de création de planification");

const scheduleActionPath = "app/api/enterprise/[organizationId]/reports/schedules/[scheduleId]/route.ts";
const scheduleAction = read(scheduleActionPath);
for (const marker of ["isSameOriginRequest", "reportScheduleUpdateSchema.safeParse", "rateLimit", 'moduleCode: "REPORTS", action: "manage"', "writeAuditLog"]) {
  expect(scheduleActionPath, scheduleAction, marker, `mutation planification protégée: ${marker}`);
}

const scheduleServicePath = "lib/enterprise/reporting/schedule-service.ts";
const scheduleService = read(scheduleServicePath);
expect(scheduleServicePath, scheduleService, "enqueueFinanceReportGeneration", "réutilisation de la file canonique de génération");
expect(scheduleServicePath, scheduleService, "generationEventId", "liaison de l’exécution au job durable existant");
expect(scheduleServicePath, scheduleService, "REPORT_EMAIL_DELIVERY_UNAVAILABLE", "échec explicite lorsque l’e-mail n’est pas configuré");
expect(scheduleServicePath, scheduleService, "organizationId", "isolation tenant des planifications");
forbid(scheduleServicePath, scheduleService, /create\s*\(\s*\{[\s\S]{0,200}EnterpriseDomainEvent/i, "aucune deuxième file de jobs créée dans le service de planification");

const schedulingSchemaPath = "prisma/enterprise-report-scheduling.prisma";
const schedulingSchema = read(schedulingSchemaPath);
expect(schedulingSchemaPath, schedulingSchema, "model EnterpriseReportSchedule", "modèle additif de planification");
expect(schedulingSchemaPath, schedulingSchema, "model EnterpriseReportScheduleRun", "historique additif des exécutions");
expect(schedulingSchemaPath, schedulingSchema, "@@unique([organizationId, scheduleId, dueAt])", "idempotence d’une échéance planifiée");

const pdfPath = "lib/reporting/professional-pdf-v2.ts";
const pdf = read(pdfPath);
expect(pdfPath, pdf, "tablePages", "pagination des tableaux détaillés");
expect(pdfPath, pdf, "rowsPerPage", "nombre de lignes borné par page");
expect(pdfPath, pdf, "Page ${index + 1}/${pages.length}", "pagination X/Y");
expect(pdfPath, pdf, "landscape = model.columns.length > 5", "orientation paysage pour tableaux larges");
expect(pdfPath, pdf, "model.rows.slice(offset, offset + rowsPerPage)", "données détaillées incluses dans le PDF");
forbid(pdfPath, pdf, /dark:|bg-dtsc|text-dtsc/, "aucun token de thème sombre/UI copié dans le PDF");

const viewPath = "components/reports/professional-report-view.tsx";
const view = read(viewPath);
expect(viewPath, view, "safeInternalDeepLink", "validation des deep-links internes");
expect(viewPath, view, "__deepLink", "drill-down porté par le modèle professionnel");
expect(viewPath, view, "ExternalLink", "action visible de drill-down");
expect(viewPath, view, "overflow-x-auto overscroll-x-contain", "scroll horizontal local du tableau et des KPI");
expect(viewPath, view, "min-w-[min(78vw,240px)]", "KPI lisibles sur petits écrans");
expect(viewPath, view, "downloadProfessionalPdfV2", "nouveau moteur PDF utilisé par la vue");

const workspacePath = "components/enterprise/core-v2/enterprise-reports-workspace.tsx";
const workspace = read(workspacePath);
expect(workspacePath, workspace, "catalog.map", "types de rapports dérivés du catalogue serveur");
forbid(workspacePath, workspace, "const reportTypes =", "liste locale codée en dur des types de rapports");
expect(workspacePath, workspace, "supportedFilters", "formulaire piloté par les filtres du catalogue");
expect(workspacePath, workspace, "generationDraft", "valeurs conservées après échec de génération");
expect(workspacePath, workspace, "h-[100dvh] w-screen max-w-none", "détail/formulaire plein écran mobile");

const aiContractPath = "lib/ai/tools/report-analysis-contract.ts";
const aiContract = read(aiContractPath);
expect(aiContractPath, aiContract, 'code: REPORT_ANALYSIS_AI_TOOL_CODE', "outil IA spécialisé enregistré");
expect(aiContractPath, aiContract, 'requiredModuleCodes: ["REPORTS"]', "permission module REPORTS obligatoire");
expect(aiContractPath, aiContract, 'minimumPlan: "BUSINESS"', "contrainte de plan conservée");
expect(aiContractPath, aiContract, 'mode: "READ"', "outil IA strictement lecture");
expect(aiContractPath, aiContract, "causalClaimsAllowed", "contrat explicite contre la causalité inventée");
expect(aiContractPath, aiContract, "INSUFFICIENT_DATA", "état de données insuffisantes");

const aiExecutorPath = "lib/ai/tools/executors/report-analysis.ts";
const aiExecutor = read(aiExecutorPath);
expect(aiExecutorPath, aiExecutor, "enterpriseReportVisibilityWhere", "même visibilité utilisateur que REPORTS");
expect(aiExecutorPath, aiExecutor, 'moduleCode: "REPORTS"', "revalidation REPORTS dans l’exécuteur");
expect(aiExecutorPath, aiExecutor, 'sourceBound: "PERSISTED_REPORT_SNAPSHOT"', "analyse bornée au snapshot persisté");
expect(aiExecutorPath, aiExecutor, "report.snapshotJson", "source unique de l’évidence IA");
expect(aiExecutorPath, aiExecutor, "disclosureRequired: true", "divulgation obligatoire de l’analyse IA");
forbid(aiExecutorPath, aiExecutor, "prisma.enterpriseExpense", "l’analyse IA ne relit pas les dépenses sources");
forbid(aiExecutorPath, aiExecutor, "prisma.enterprisePurchase", "l’analyse IA ne relit pas les achats sources");
forbid(aiExecutorPath, aiExecutor, "prisma.enterpriseBudget", "l’analyse IA ne relit pas les budgets sources");

const aiRegistryPath = "lib/ai/tool-registry.ts";
const aiRegistry = read(aiRegistryPath);
expect(aiRegistryPath, aiRegistry, "REPORT_ANALYSIS_AI_TOOL_DEFINITIONS", "outil IA raccordé au registre canonique");
const aiSchemasPath = "lib/ai/tools/schemas.ts";
const aiSchemas = read(aiSchemasPath);
expect(aiSchemasPath, aiSchemas, "REPORT_ANALYSIS_AI_TOOL_INPUT_SCHEMAS", "schéma d’entrée IA raccordé");
expect(aiSchemasPath, aiSchemas, "REPORT_ANALYSIS_AI_TOOL_OUTPUT_SCHEMAS", "schéma de sortie IA raccordé");
const aiExecutorsPath = "lib/ai/tools/executors/index.ts";
const aiExecutors = read(aiExecutorsPath);
expect(aiExecutorsPath, aiExecutors, "REPORT_ANALYSIS_AI_TOOL_EXECUTORS", "exécuteur IA raccordé au gateway");

const cronPath = "vercel.json";
const cron = read(cronPath);
expect(cronPath, cron, "/api/internal/report-schedules/process?batch=20", "worker de planification déclenché par cron");

const i18nPath = "lib/enterprise-core-i18n.ts";
const i18n = read(i18nPath);
for (const key of ["reports.schedule.title", "reports.schedule.emailUnavailable", "reports.schedule.frequency.DAILY", "reports.schedule.period.CUSTOM"]) {
  const count = i18n.split(`\"${key}\"`).length - 1;
  if (count < 3) failures.push(`${i18nPath}: contrat absent — clé ${key} doit exister dans le type, FR et EN`);
}

if (failures.length) {
  console.error("FAIL QA Reporting 2.0 #634");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("QA Reporting 2.0 #634 réussie.");
console.log("- Génération: catalogue, références tenant-scoped, no-data explicite et conservation du brouillon.");
console.log("- Présentation: responsive, drill-down autorisé et PDF multi-page indépendant du thème UI.");
console.log("- Planification: CRUD manager-only, sécurité, idempotence, file durable canonique et livraison bornée.");
console.log("- IA DTSC: outil READ REPORTS, snapshot-only, visibilité tenant/RBAC et garde anti-causalité.");
