import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";

export const ERP_AI_READ_SPECS = [
  { code: "ERP_TASKS_READ", moduleCode: "TASKS_OPERATIONS", label: "Tâches & opérations", description: "Lire les tâches et opérations récentes autorisées de l’entreprise." },
  { code: "ERP_REQUESTS_READ", moduleCode: "INTERNAL_REQUESTS", label: "Demandes internes", description: "Lire les demandes internes récentes et leurs statuts." },
  { code: "ERP_APPROVALS_READ", moduleCode: "VALIDATIONS", label: "Validations", description: "Lire les validations et décisions récentes autorisées." },
  { code: "ERP_MEETINGS_READ", moduleCode: "MEETINGS", label: "Réunions", description: "Lire les réunions, échéances et décisions récentes autorisées." },
  { code: "ERP_WORKFLOWS_READ", moduleCode: "WORKFLOWS", label: "Workflows", description: "Lire les workflows actifs et leurs exécutions récentes." },
  { code: "ERP_PROCUREMENT_READ", moduleCode: "SUPPLIERS_PURCHASES", label: "Fournisseurs & achats", description: "Lire les fournisseurs et achats autorisés, avec montants, devises et statuts utiles." },
  { code: "ERP_DOCUMENTS_READ", moduleCode: "DOCUMENTS", label: "Documents", description: "Lire les métadonnées métier des documents autorisés, sans exposer les chemins de stockage." },
  { code: "ERP_REPORTS_READ", moduleCode: "REPORTS", label: "Rapports", description: "Lire les rapports d’entreprise autorisés et leurs statuts de publication." },
  { code: "ERP_CUSTOMERS_READ", moduleCode: "CRM_CUSTOMERS", label: "Tiers & clients", description: "Lire les tiers, clients, prospects et rôles métier autorisés." },
  { code: "ERP_CATALOG_READ", moduleCode: "CATALOG", label: "Catalogue", description: "Lire les produits et services, prix indicatifs et statuts du catalogue autorisé." },
  { code: "ERP_SITES_READ", moduleCode: "SITES_WAREHOUSES", label: "Sites & entrepôts", description: "Lire les sites et entrepôts autorisés de l’entreprise." },
  { code: "ERP_CRM_PIPELINE_READ", moduleCode: "CRM_PIPELINE", label: "CRM & pipeline", description: "Lire les opportunités commerciales, valeurs estimées, probabilités et prochaines actions autorisées." },
  { code: "ERP_SALES_READ", moduleCode: "SALES_QUOTES_ORDERS", label: "Devis & commandes", description: "Lire les devis et commandes autorisés, avec leurs montants, devises et statuts." },
  { code: "ERP_CONTRACTS_READ", moduleCode: "CONTRACTS", label: "Contrats", description: "Lire les contrats autorisés, échéances, montants indicatifs et statuts." },
  { code: "ERP_INVENTORY_READ", moduleCode: "INVENTORY_LOGISTICS", label: "Stock & logistique", description: "Lire les niveaux de stock, disponibilités, seuils et mouvements autorisés." },
  { code: "ERP_HR_READ", moduleCode: "HUMAN_RESOURCES", label: "Ressources humaines", description: "Lire les informations professionnelles RH autorisées et les indicateurs d’effectif." },
  { code: "ERP_TIME_ATTENDANCE_READ", moduleCode: "TIME_ATTENDANCE", label: "Temps, présences & congés", description: "Lire les présences, feuilles de temps et congés autorisés." },
  { code: "ERP_PAYROLL_READ", moduleCode: "PAYROLL_OPERATIONS", label: "Paie opérationnelle", description: "Lire les runs de paie autorisés, effectifs, montants et statuts." },
  { code: "ERP_PROJECTS_READ", moduleCode: "PROJECTS_SERVICES", label: "Projets & services", description: "Lire les projets autorisés, progression, budgets indicatifs et risques." },
  { code: "ERP_DELIVERABLES_READ", moduleCode: "TIME_DELIVERABLES", label: "Temps & livrables", description: "Lire les livrables projet et feuilles de temps liées autorisés." },
  { code: "ERP_ASSETS_READ", moduleCode: "ASSETS_MAINTENANCE", label: "Actifs & maintenance", description: "Lire les actifs, valeurs indicatives, maintenance et incidents autorisés." },
  { code: "ERP_RETAIL_POS_READ", moduleCode: "RETAIL_POS", label: "Point de vente", description: "Lire les ventes comptoir et indicateurs Retail autorisés." },
  { code: "ERP_MOBILE_MONEY_READ", moduleCode: "MOBILE_MONEY_AGENCY", label: "Agence Mobile Money", description: "Lire les transactions Mobile Money autorisées avec montants, devises, frais, commissions et statuts." },
  { code: "ERP_TELCO_READ", moduleCode: "TELCO_TOPUPS", label: "Télécom & forfaits", description: "Lire les transactions Télécom autorisées avec montants, coûts, marges et statuts." },
  { code: "ERP_RETAIL_CLOSE_READ", moduleCode: "RETAIL_DAILY_CLOSE", label: "Clôture magasin", description: "Lire les clôtures magasin autorisées, écarts et montants utiles." },
] as const;

export type ErpAiReadToolCode = (typeof ERP_AI_READ_SPECS)[number]["code"];

const inputSchema = z.object({
  periodDays: z.number().int().min(1).max(366).optional(),
  limit: z.number().int().min(1).max(25).optional(),
}).strict();

const outputSchema = z.object({
  toolName: z.string().min(1),
  label: z.string().min(1),
  status: z.string().min(1),
  summary: z.string(),
  asOf: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    periodDays: { type: "integer", minimum: 1, maximum: 366 },
    limit: { type: "integer", minimum: 1, maximum: 25 },
  },
  additionalProperties: false,
} as const;

const OUTPUT_JSON_SCHEMA = { type: "object" } as const;

export const ERP_AI_TOOL_INPUT_SCHEMAS = Object.fromEntries(
  ERP_AI_READ_SPECS.map((spec) => [spec.code, inputSchema]),
) as Record<ErpAiReadToolCode, typeof inputSchema>;

export const ERP_AI_TOOL_OUTPUT_SCHEMAS = Object.fromEntries(
  ERP_AI_READ_SPECS.map((spec) => [spec.code, outputSchema]),
) as Record<ErpAiReadToolCode, typeof outputSchema>;

export const ERP_AI_TOOL_DESCRIPTIONS = Object.fromEntries(
  ERP_AI_READ_SPECS.map((spec) => [spec.code, spec.description]),
) as Record<ErpAiReadToolCode, string>;

export const ERP_AI_TOOL_DEFINITIONS: AiToolDefinition[] = ERP_AI_READ_SPECS.map((spec) => ({
  code: spec.code,
  labelKey: `ai.tools.erp.${spec.moduleCode.toLowerCase()}.label`,
  descriptionKey: spec.description,
  inputSchema: INPUT_JSON_SCHEMA,
  outputSchema: OUTPUT_JSON_SCHEMA,
  contexts: ["ORGANIZATION"],
  requiredModuleCodes: [spec.moduleCode],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"],
  minimumPlan: "BUSINESS",
  allowedAssistantCodes: ["ENTERPRISE_GENERAL"],
  mode: "READ",
  requiresConfirmation: false,
  idempotent: false,
  auditLevel: "SENSITIVE",
}));

export function getErpAiReadSpec(code: string) {
  return ERP_AI_READ_SPECS.find((spec) => spec.code === code) || null;
}
