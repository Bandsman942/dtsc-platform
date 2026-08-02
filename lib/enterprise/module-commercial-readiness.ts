import readinessManifest from "@/lib/enterprise/module-commercial-readiness.json";
import iteration03Manifest from "@/lib/enterprise/module-commercial-readiness-iteration-03.json";
import iteration04Manifest from "@/lib/enterprise/module-commercial-readiness-iteration-04.json";
import {
  ENTERPRISE_MODULE_REGISTRY,
  getEnterpriseModuleDefinition,
  type EnterpriseModuleDefinition,
} from "@/lib/enterprise/module-registry";

export type EnterpriseModuleCommercialMaturity =
  | "BACKEND_READY"
  | "READ_ONLY_UI"
  | "OPERATIONAL_UI"
  | "PROFESSIONAL_READY"
  | "COMMERCIAL_READY";

export type EnterpriseModuleInterfaceKind =
  | "GENERIC_OR_UNVERIFIED"
  | "DEDICATED"
  | "CONSOLIDATED_ADMINISTRATION"
  | "HIDDEN_OR_RETIRED";

export type EnterpriseModuleCommercialAssessment = {
  moduleCode: string;
  labelFr: string;
  labelEn: string;
  implementationStatus: EnterpriseModuleDefinition["implementationStatus"];
  routeKind: EnterpriseModuleDefinition["routeKind"];
  routePath: string | null;
  workspaceKey: string | null;
  minimumPlan: EnterpriseModuleDefinition["minimumPlan"];
  dependencies: string[];
  maturity: EnterpriseModuleCommercialMaturity;
  interfaceKind: EnterpriseModuleInterfaceKind;
  evaluatedAt: string;
  policyVersion: string;
  criteriaSatisfied: string[];
  criteriaMissing: string[];
  qaContract: string | null;
  evidence: string[];
  nextIteration: number | null;
  commercializable: boolean;
  commentFr: string;
  commentEn: string;
};

type AssessmentSource = {
  maturity: string;
  interfaceKind: string;
  criteriaSatisfied: string[];
  criteriaMissing: string[];
  qaContract?: string;
  evidence?: string[];
  nextIteration?: number;
  commercializable: boolean;
  commentFr: string;
  commentEn: string;
};

type ReadinessManifest = {
  version: number;
  evaluatedAt: string;
  policyVersion: string;
  defaultAssessment: AssessmentSource;
  profiles: Record<string, AssessmentSource>;
  moduleOverrides: Record<string, AssessmentSource>;
};

type IterationManifest = {
  version: number;
  evaluatedAt: string;
  policyVersion: string;
  moduleOverrides: Record<string, AssessmentSource>;
};

const baseManifest = readinessManifest as ReadinessManifest;
const iteration03 = iteration03Manifest as IterationManifest;
const iteration04 = iteration04Manifest as IterationManifest;

const manifest: ReadinessManifest = {
  ...baseManifest,
  version: Math.max(baseManifest.version, iteration03.version, iteration04.version),
  evaluatedAt: iteration04.evaluatedAt,
  policyVersion: iteration04.policyVersion,
  moduleOverrides: {
    ...baseManifest.moduleOverrides,
    ...iteration03.moduleOverrides,
    ...iteration04.moduleOverrides,
  },
};

export const ENTERPRISE_COMMERCIAL_READINESS_VERSION = manifest.version;
export const ENTERPRISE_COMMERCIAL_READINESS_EVALUATED_AT = manifest.evaluatedAt;

function resolveAssessmentSource(definition: EnterpriseModuleDefinition): AssessmentSource {
  const direct = manifest.moduleOverrides[definition.code];
  if (direct) return direct;

  if (
    definition.implementationStatus === "PLANNED" ||
    definition.implementationStatus === "HIDDEN" ||
    definition.implementationStatus === "RETIRED" ||
    definition.routeKind === "HIDDEN"
  ) {
    return manifest.profiles.HIDDEN || manifest.defaultAssessment;
  }

  if (definition.routeKind === "ADMIN_SECTION") {
    return manifest.profiles.ADMIN_SECTION || manifest.defaultAssessment;
  }

  return manifest.defaultAssessment;
}

export function getEnterpriseModuleCommercialAssessment(
  moduleCode: string,
): EnterpriseModuleCommercialAssessment | null {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition) return null;
  const source = resolveAssessmentSource(definition);
  const maturity = source.maturity as EnterpriseModuleCommercialMaturity;
  const commercializable = maturity === "COMMERCIAL_READY" && source.commercializable;

  return {
    moduleCode: definition.code,
    labelFr: definition.labelFr,
    labelEn: definition.labelEn,
    implementationStatus: definition.implementationStatus,
    routeKind: definition.routeKind,
    routePath: definition.routePath || null,
    workspaceKey: definition.workspaceKey,
    minimumPlan: definition.minimumPlan,
    dependencies: [...definition.dependencies],
    maturity,
    interfaceKind: source.interfaceKind as EnterpriseModuleInterfaceKind,
    evaluatedAt: manifest.evaluatedAt,
    policyVersion: manifest.policyVersion,
    criteriaSatisfied: [...source.criteriaSatisfied],
    criteriaMissing: [...source.criteriaMissing],
    qaContract: source.qaContract || definition.qaContract || null,
    evidence: [...(source.evidence || [])],
    nextIteration: source.nextIteration ?? null,
    commercializable,
    commentFr: source.commentFr,
    commentEn: source.commentEn,
  };
}

export function listEnterpriseModuleCommercialAssessments() {
  return ENTERPRISE_MODULE_REGISTRY.map((definition) =>
    getEnterpriseModuleCommercialAssessment(definition.code),
  ).filter((assessment): assessment is EnterpriseModuleCommercialAssessment => Boolean(assessment));
}

export function isEnterpriseModuleCommerciallyReady(moduleCode: string) {
  return getEnterpriseModuleCommercialAssessment(moduleCode)?.commercializable === true;
}

export function getCommercialMaturityLabel(
  maturity: EnterpriseModuleCommercialMaturity,
  locale?: string | null,
) {
  const english = locale === "en";
  const labels: Record<EnterpriseModuleCommercialMaturity, { fr: string; en: string }> = {
    BACKEND_READY: { fr: "Backend prêt", en: "Backend ready" },
    READ_ONLY_UI: { fr: "Interface de consultation", en: "Read-only interface" },
    OPERATIONAL_UI: { fr: "Interface opérationnelle", en: "Operational interface" },
    PROFESSIONAL_READY: { fr: "Prêt professionnellement", en: "Professionally ready" },
    COMMERCIAL_READY: { fr: "Prêt à commercialiser", en: "Commercially ready" },
  };
  return english ? labels[maturity].en : labels[maturity].fr;
}
