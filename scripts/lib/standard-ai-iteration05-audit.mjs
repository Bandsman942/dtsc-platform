import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

export function runStandardAiIteration05Audit(scope = "all") {
  const failures = [];
  const read = (relativePath) => {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) {
      failures.push(`Missing file: ${relativePath}`);
      return "";
    }
    return fs.readFileSync(absolute, "utf8");
  };
  const requireText = (relativePath, needles) => {
    const content = read(relativePath);
    for (const needle of needles) if (!content.includes(needle)) failures.push(`${relativePath}: missing contract ${needle}`);
  };
  const requireNoText = (relativePath, needles) => {
    const content = read(relativePath);
    for (const needle of needles) if (content.includes(needle)) failures.push(`${relativePath}: forbidden pattern ${needle}`);
  };

  const checks = {
    "model-registry": () => {
      requireText("lib/ai/catalog.ts", ["getAiProviderCatalog", "getAiModelCatalog", "assertAiCatalogIntegrity", "fallbackModelCodes", "allowedContexts", "listCatalogAiModelsForUi", "isCatalogAiModelAllowed"]);
      requireText("lib/ai/types.ts", ["AiModelDefinition", "AiProviderDefinition", "costProfile", "dataPolicyCode"]);
    },
    "provider-configuration": () => {
      requireText("lib/ai/provider.ts", ["apiKeyEnv", "process.env[provider.apiKeyEnv]", "OPENAI_RESPONSES", "store: false"]);
      requireNoText("lib/ai/provider.ts", ["OPENAI_API_KEY =", "sk-"]);
    },
    orchestration: () => {
      requireText("lib/ai/orchestrator.ts", ["CAPABILITY_COST_HEALTH_V1", "selectCandidates", "fallbackUsed", "createProviderResponseStream"]);
      requireText("app/api/chat/v2/route.ts", ["routeAiStream", "classifyAiTask", "X-AI-Provider"]);
      requireText("app/api/enterprise/ai/chat/route.ts", ["routeAiStream", "context: \"ORGANIZATION\"", "X-AI-Fallback"]);
    },
    fallbacks: () => {
      requireText("lib/ai/orchestrator.ts", ["error.retryable", "attempts.push", "fallbackModelCodes"]);
      requireText("lib/ai/errors.ts", ["RATE_LIMITED", "TIMEOUT", "MODEL_UNAVAILABLE", "PROVIDER_UNAVAILABLE"]);
    },
    "conversation-isolation": () => {
      requireText("app/api/enterprise/ai/chat/route.ts", ["organizationId: data.organizationId", "userId: session.userId", "status: \"ACTIVE\"", "deletedAt: null"]);
      requireText("lib/commercial-maturity-governance.ts", ["moduleType", "moduleCode"]);
    },
    "tool-permissions": () => {
      requireText("lib/ai/tool-registry.ts", ["requiredPermissions", "requiredModuleCodes", "requiresConfirmation", "SENSITIVE_MUTATE"]);
      requireText("app/api/enterprise/ai/chat/route.ts", ["access.canUseReadTools", "runPharmacyReadTools"]);
    },
    "tool-idempotency": () => {
      requireText("lib/ai/tool-registry.ts", ["idempotent: true", "mutations must be idempotent"]);
      requireText("prisma/standard-ai-governance.prisma", ["idempotencyKey", "@unique"]);
    },
    "knowledge-permissions": () => {
      requireText("lib/enterprise-ai/knowledge.ts", ["organizationId", "allowedConfidentialities", "ks.\"organizationId\" = $2", "archivedAt"]);
      requireText("app/api/enterprise/ai/knowledge-sources/route.ts", ["getEnterpriseAiAccess", "canUploadSources"]);
    },
    citations: () => {
      requireText("lib/enterprise-ai/knowledge.ts", ["language: string", "pageNumber", "section", "distance"]);
      requireText("app/api/enterprise/ai/chat/route.ts", ["citationsJson", "language: citation.language", "pageNumber: citation.pageNumber"]);
    },
    "data-classification": () => {
      requireText("docs/STANDARD_AI_DATA_CLASSIFICATION.md", ["PUBLIC", "CONFIDENTIAL", "HEALTH_SENSITIVE", "HR_SENSITIVE", "FINANCIAL_SENSITIVE", "SECRET"]);
      requireText("lib/enterprise-ai/context.ts", ["fuite multi-tenant", "secret", "données"]);
    },
    "usage-costs": () => {
      requireText("lib/ai/costs.ts", ["inputPerMillion", "outputPerMillion", "UNKNOWN", "ESTIMATED"]);
      requireText("lib/ai/observability.ts", ["AiModelCall", "estimatedCost", "firstTokenLatencyMs", "durationMs"]);
      requireNoText("lib/openai.ts", ["export function estimateCost() {\n  return 0;"]);
    },
    prompts: () => {
      requireText("lib/ai/prompts.ts", ["AI_PROMPT_REGISTRY", "GLOBAL_ASSISTANT", "ENTERPRISE_ASSISTANT", "2026-08-04.1"]);
      requireText("app/api/chat/v2/route.ts", ["getAiPromptVersion(\"GLOBAL_ASSISTANT\")"]);
    },
    i18n: () => {
      requireText("locales/fr.json", ["\"ai\"", "\"commercialMaturity\"", "\"userGuides\""]);
      requireText("locales/en.json", ["\"ai\"", "\"commercialMaturity\"", "\"userGuides\""]);
      requireText("lib/ai/i18n.ts", ["getAiErrorMessage", "STREAM_INTERRUPTED"]);
      requireText("lib/ai/prompts.ts", ["Ne traduis pas silencieusement", "citations restent dans leur langue source"]);
    },
    guides: () => {
      requireText("lib/user-guides/iteration05-guides.ts", ["GLOBAL_CHATBOT", "ENTERPRISE_AI_ASSISTANT", "AI_FILES_AND_SOURCES", "COMMERCIAL_MATURITY_KANBAN"]);
      requireText("components/chat/chat-workspace-v2.tsx", ["ContextualUserGuide", "GLOBAL_CHATBOT"]);
      requireText("components/enterprise/enterprise-ai-workspace-v2.tsx", ["ContextualUserGuide", "ENTERPRISE_AI_ASSISTANT"]);
      requireText("components/user-guides/contextual-user-guide.tsx", ["useAppLocale", "translate", "userGuides.common.userGuide"]);
    },
    "commercial-maturity-kanban": () => {
      requireText("components/admin/erp-commercial-readiness-dashboard.tsx", ["KANBAN", "COMMERCIAL_MATURITY_LEVELS", "overflow-x-auto", "COMMERCIAL_MATURITY_KANBAN"]);
      requireText("lib/commercial-maturity-governance.ts", ["STANDARD", "ERP", "evidenceCount", "history"]);
      requireText("app/admin/erp-readiness/page.tsx", ["listCommercialMaturityCards"]);
    },
    "commercial-maturity-transitions": () => {
      requireText("app/api/admin/commercial-maturity/transitions/route.ts", ["isSameOriginRequest", "rateLimit", "OWNER_VALIDATION_REQUIRED", "INCIDENT_EVIDENCE_REQUIRED", "idempotencyKey", "writeAuditLog"]);
      requireText("prisma/standard-ai-governance.prisma", ["model CommercialMaturityEvidence", "model CommercialMaturityTransition", "ownerValidatedAt", "e2eStatus"]);
    },
    "knowledge-checks": () => {
      requireText("prisma/standard-ai-governance.prisma", ["model AiModelCall", "model CommercialMaturityTransition"]);
      requireText("prisma/migrations/20260804173000_standard_ai_governance_iteration_05/migration.sql", ["CREATE TABLE \"AiModelCall\"", "CommercialMaturityTransition", "EnterpriseAiKnowledgeChunk"]);
      requireText("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_05.md", ["NON_EXÉCUTÉ", "Tests E2E manuels préparés — validation du propriétaire en attente"]);
    },
  };

  if (scope === "all") Object.values(checks).forEach((check) => check());
  else if (checks[scope]) checks[scope]();
  else failures.push(`Unknown iteration 05 QA scope: ${scope}`);

  if (failures.length) {
    console.error(`Standard AI iteration 05 audit failed (${scope})`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Standard AI iteration 05 audit passed (${scope}).`);
}
