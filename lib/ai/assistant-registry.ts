import type { AiContextCode } from "@/lib/ai/types";

export type AssistantProfile = {
  code: string;
  scope: "GLOBAL" | "DTSC_INTERNAL" | "ENTERPRISE" | "SECTOR" | "MODULE";
  sectorCode?: string | null;
  moduleCode?: string | null;
  promptCode: string;
  modelPolicyCode: string;
  knowledgePolicyCode: string;
  toolPolicyCode: string;
  dataPolicyCode: string;
  allowedContexts: AiContextCode[];
  allowedToolCodes?: string[];
  version: string;
};

const PROFILES: AssistantProfile[] = [
  {
    code: "DTSC_GENERAL",
    scope: "GLOBAL",
    promptCode: "GLOBAL_ASSISTANT",
    modelPolicyCode: "POLICY_CAPABILITY_COST_HEALTH_V2",
    knowledgePolicyCode: "USER_SCOPED_RAG",
    toolPolicyCode: "GLOBAL_SAFE_TOOLS",
    dataPolicyCode: "STANDARD_INTERNAL",
    allowedContexts: ["PERSONAL", "DTSC_INTERNAL", "ORGANIZATION", "PROJECT", "MODULE", "OBJECT"],
    version: "1",
  },
  {
    code: "ENTERPRISE_GENERAL",
    scope: "ENTERPRISE",
    promptCode: "ENTERPRISE_ASSISTANT",
    modelPolicyCode: "POLICY_CAPABILITY_COST_HEALTH_V2",
    knowledgePolicyCode: "ENTERPRISE_RAG",
    toolPolicyCode: "ENTERPRISE_SAFE_TOOLS",
    dataPolicyCode: "ENTERPRISE_INTERNAL",
    allowedContexts: ["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"],
    version: "1",
  },
  {
    code: "PHARMACY_ASSISTANT",
    scope: "SECTOR",
    sectorCode: "PHARMACY",
    promptCode: "ENTERPRISE_ASSISTANT",
    modelPolicyCode: "POLICY_CAPABILITY_COST_HEALTH_V2",
    knowledgePolicyCode: "ENTERPRISE_RAG_PHARMACY",
    toolPolicyCode: "PHARMACY_READ_ONLY",
    dataPolicyCode: "ENTERPRISE_RESTRICTED",
    allowedContexts: ["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"],
    version: "1",
  },
  {
    code: "HEALTH_ASSISTANT",
    scope: "SECTOR",
    sectorCode: "HEALTH_CARE",
    promptCode: "ENTERPRISE_ASSISTANT",
    modelPolicyCode: "POLICY_CAPABILITY_COST_HEALTH_V2",
    knowledgePolicyCode: "ENTERPRISE_RAG_HEALTH",
    toolPolicyCode: "HEALTH_NO_MUTATION",
    dataPolicyCode: "HEALTH_SENSITIVE",
    allowedContexts: ["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"],
    version: "1",
  },
  {
    code: "SHOP_ASSISTANT",
    scope: "SECTOR",
    sectorCode: "COMMERCE_RETAIL",
    promptCode: "ENTERPRISE_ASSISTANT",
    modelPolicyCode: "POLICY_CAPABILITY_COST_HEALTH_V2",
    knowledgePolicyCode: "ENTERPRISE_RAG_SHOP",
    toolPolicyCode: "SHOP_READ_ONLY",
    dataPolicyCode: "ENTERPRISE_INTERNAL",
    allowedContexts: ["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"],
    version: "1",
  },
];

export function getAssistantProfiles() {
  return [...PROFILES];
}

export function getAssistantProfile(code?: string | null) {
  if (!code) return null;
  return PROFILES.find((profile) => profile.code === code) || null;
}

export function resolveAssistantProfile({
  context,
  sectorCode,
  moduleCode,
  requestedCode,
}: {
  context: AiContextCode;
  sectorCode?: string | null;
  moduleCode?: string | null;
  requestedCode?: string | null;
}) {
  const requested = getAssistantProfile(requestedCode);
  if (requested) {
    const contextAllowed = requested.allowedContexts.includes(context);
    const sectorAllowed = !requested.sectorCode || requested.sectorCode === sectorCode;
    const moduleAllowed = !requested.moduleCode || requested.moduleCode === moduleCode;
    if (contextAllowed && sectorAllowed && moduleAllowed) return requested;
  }

  const sectorProfile = PROFILES.find((profile) =>
    profile.scope === "SECTOR" &&
    profile.sectorCode === sectorCode &&
    profile.allowedContexts.includes(context),
  );
  if (sectorProfile) return sectorProfile;

  if (["ORGANIZATION", "PROJECT", "MODULE", "OBJECT"].includes(context)) {
    return PROFILES.find((profile) => profile.code === "ENTERPRISE_GENERAL")!;
  }
  return PROFILES.find((profile) => profile.code === "DTSC_GENERAL")!;
}
