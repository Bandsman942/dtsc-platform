import { listEnterpriseModuleCommercialAssessments, type EnterpriseModuleCommercialMaturity } from "@/lib/enterprise/module-commercial-readiness";
import { listStandardModuleDefinitions, type StandardModuleMaturity } from "@/lib/modules/standard-module-registry";
import { prisma } from "@/lib/prisma";

export const COMMERCIAL_MATURITY_LEVELS = ["BACKEND_READY", "READ_ONLY_UI", "OPERATIONAL_UI", "PROFESSIONAL_READY", "COMMERCIAL_READY"] as const;
export type CommercialMaturity = (typeof COMMERCIAL_MATURITY_LEVELS)[number];
export type CommercialModuleType = "STANDARD" | "ERP";

export type CommercialMaturityHistoryItem = {
  id: string;
  fromMaturity: CommercialMaturity;
  toMaturity: CommercialMaturity;
  reason: string;
  status: string;
  actorId: string;
  actorName: string | null;
  evidence: Array<{ id: string; evidenceType: string; title: string; url: string | null }>;
  createdAt: string;
  iterationCode: string | null;
  pullRequestNumber: number | null;
  commitSha: string | null;
  productionDeploymentId: string | null;
  e2eStatus: string;
  ownerValidatedAt: string | null;
};

export type CommercialMaturityCard = {
  key: string;
  moduleType: CommercialModuleType;
  moduleCode: string;
  labelFr: string;
  labelEn: string;
  family: string;
  domain: string;
  technicalStatus: string;
  baseMaturity: CommercialMaturity;
  maturity: CommercialMaturity;
  routePath: string | null;
  minimumPlan: string | null;
  iteration: string | null;
  responsible: string | null;
  dependencies: string[];
  incidents: Array<{ id: string; title: string; description: string | null; url: string | null; createdAt: string }>;
  criteriaSatisfied: string[];
  criteriaMissing: string[];
  progress: number;
  evidenceCount: number;
  guidePresent: boolean;
  qaContract: string | null;
  qaGreen: boolean;
  e2eStatus: string;
  blocked: boolean;
  blockers: string[];
  lastEvolutionAt: string | null;
  commentFr: string;
  commentEn: string;
  history: CommercialMaturityHistoryItem[];
};

function isMaturity(value: string): value is CommercialMaturity {
  return (COMMERCIAL_MATURITY_LEVELS as readonly string[]).includes(value);
}

function calculateProgress(satisfied: string[], missing: string[]) {
  const total = satisfied.length + missing.length;
  return total ? Math.round((satisfied.length / total) * 100) : 0;
}

function inferIteration(value?: number | null) {
  return value == null ? null : `ERP-${String(value).padStart(2, "0")}`;
}

function evidenceIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

export async function listCommercialMaturityCards(): Promise<CommercialMaturityCard[]> {
  const [transitions, evidence] = await Promise.all([
    prisma.commercialMaturityTransition.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.commercialMaturityEvidence.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const actors = await prisma.user.findMany({
    where: { id: { in: [...new Set(transitions.map((transition) => transition.createdById))] } },
    select: { id: true, name: true, email: true },
  });
  const actorById = new Map(actors.map((actor) => [actor.id, actor.name || actor.email]));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const transitionByKey = new Map<string, typeof transitions>();
  const evidenceByKey = new Map<string, typeof evidence>();
  for (const transition of transitions) {
    const key = `${transition.moduleType}:${transition.moduleCode}`;
    const items = transitionByKey.get(key) || [];
    items.push(transition);
    transitionByKey.set(key, items);
  }
  for (const item of evidence) {
    const key = `${item.moduleType}:${item.moduleCode}`;
    const items = evidenceByKey.get(key) || [];
    items.push(item);
    evidenceByKey.set(key, items);
  }

  const standardCards = listStandardModuleDefinitions().map((definition): CommercialMaturityCard => {
    const key = `STANDARD:${definition.code}`;
    const historyRows = transitionByKey.get(key) || [];
    const latestApplied = historyRows.find((transition) => transition.status === "APPLIED" && isMaturity(transition.toMaturity));
    const maturity = (latestApplied?.toMaturity as CommercialMaturity | undefined) || definition.maturity;
    const evidenceRows = evidenceByKey.get(key) || [];
    const qaGreen = evidenceRows.some((item) => item.evidenceType === "QA_PASSED") || Boolean(definition.commercialEvidencePath && maturity === "COMMERCIAL_READY");
    const productionVerified = evidenceRows.some((item) => item.evidenceType === "PRODUCTION_VERIFIED" || Boolean(item.productionId)) || Boolean(definition.commercialEvidencePath);
    const professionalOrAbove = COMMERCIAL_MATURITY_LEVELS.indexOf(maturity) >= COMMERCIAL_MATURITY_LEVELS.indexOf("PROFESSIONAL_READY");
    const satisfied = [
      ...(definition.routePath ? ["Route canonique"] : []),
      ...(definition.userGuidePath ? ["Guide utilisateur natif"] : []),
      ...(definition.qaContract ? ["Contrat QA"] : []),
      ...(qaGreen ? ["QA verte persistée"] : []),
      ...(productionVerified ? ["Production vérifiée"] : []),
      ...(definition.commercialEvidencePath ? ["Preuve commerciale versionnée"] : []),
    ];
    const missing = [
      ...(!definition.routePath ? ["Route canonique"] : []),
      ...(!definition.userGuidePath ? ["Guide utilisateur natif"] : []),
      ...(!definition.qaContract ? ["Contrat QA"] : []),
      ...(professionalOrAbove && !qaGreen ? ["QA verte persistée"] : []),
      ...(professionalOrAbove && !productionVerified ? ["Production vérifiée"] : []),
      ...(maturity === "COMMERCIAL_READY" && !definition.commercialEvidencePath && !evidenceRows.some((item) => item.ownerValidated) ? ["Validation propriétaire"] : []),
    ];
    return {
      key,
      moduleType: "STANDARD",
      moduleCode: definition.code,
      labelFr: definition.labelFr,
      labelEn: definition.labelEn,
      family: definition.family,
      domain: definition.domain,
      technicalStatus: definition.implementationStatus,
      baseMaturity: definition.maturity,
      maturity,
      routePath: definition.routePath,
      minimumPlan: definition.minimumPlan,
      iteration: latestApplied?.iterationCode || (definition.qaContract === "scripts/qa-standard-dtsc-console-checks.mjs" ? "STANDARD-07" : null),
      responsible: null,
      dependencies: [...definition.dependencies, ...definition.erpDependencies],
      incidents: evidenceRows.filter((item) => item.evidenceType === "INCIDENT").map((item) => ({ id: item.id, title: item.title, description: item.description, url: item.url, createdAt: item.createdAt.toISOString() })),
      criteriaSatisfied: satisfied,
      criteriaMissing: missing,
      progress: calculateProgress(satisfied, missing),
      evidenceCount: evidenceRows.length + (definition.commercialEvidencePath ? 1 : 0),
      guidePresent: Boolean(definition.userGuidePath),
      qaContract: definition.qaContract,
      qaGreen,
      e2eStatus: latestApplied?.e2eStatus || "NON_EXECUTED",
      blocked: missing.length > 0,
      blockers: missing,
      lastEvolutionAt: latestApplied?.createdAt.toISOString() || evidenceRows[0]?.createdAt.toISOString() || null,
      commentFr: definition.descriptionFr,
      commentEn: definition.descriptionEn,
      history: historyRows.map((transition) => ({
        id: transition.id,
        fromMaturity: transition.fromMaturity as CommercialMaturity,
        toMaturity: transition.toMaturity as CommercialMaturity,
        reason: transition.reason,
        status: transition.status,
        actorId: transition.createdById,
        actorName: actorById.get(transition.createdById) || null,
        evidence: evidenceIds(transition.evidenceIdsJson).map((id) => evidenceById.get(id)).filter(isDefined).map((item) => ({ id: item.id, evidenceType: item.evidenceType, title: item.title, url: item.url })),
        createdAt: transition.createdAt.toISOString(),
        iterationCode: transition.iterationCode,
        pullRequestNumber: transition.pullRequestNumber,
        commitSha: transition.commitSha,
        productionDeploymentId: transition.productionDeploymentId,
        e2eStatus: transition.e2eStatus,
        ownerValidatedAt: transition.ownerValidatedAt?.toISOString() || null,
      })),
    };
  });

  const erpCards = listEnterpriseModuleCommercialAssessments().map((assessment): CommercialMaturityCard => {
    const key = `ERP:${assessment.moduleCode}`;
    const historyRows = transitionByKey.get(key) || [];
    const latestApplied = historyRows.find((transition) => transition.status === "APPLIED" && isMaturity(transition.toMaturity));
    const maturity = (latestApplied?.toMaturity as CommercialMaturity | undefined) || assessment.maturity;
    const evidenceRows = evidenceByKey.get(key) || [];
    const satisfied = [...assessment.criteriaSatisfied];
    const missing = [...assessment.criteriaMissing];
    return {
      key,
      moduleType: "ERP",
      moduleCode: assessment.moduleCode,
      labelFr: assessment.labelFr,
      labelEn: assessment.labelEn,
      family: assessment.routeKind,
      domain: assessment.workspaceKey || "ERP",
      technicalStatus: assessment.implementationStatus,
      baseMaturity: assessment.maturity,
      maturity,
      routePath: assessment.routePath,
      minimumPlan: assessment.minimumPlan,
      iteration: latestApplied?.iterationCode || inferIteration(assessment.nextIteration),
      responsible: null,
      dependencies: [...assessment.dependencies],
      incidents: evidenceRows.filter((item) => item.evidenceType === "INCIDENT").map((item) => ({ id: item.id, title: item.title, description: item.description, url: item.url, createdAt: item.createdAt.toISOString() })),
      criteriaSatisfied: satisfied,
      criteriaMissing: missing,
      progress: calculateProgress(satisfied, missing),
      evidenceCount: evidenceRows.length + assessment.evidence.length,
      guidePresent: satisfied.some((criterion) => /guide/i.test(criterion)) || evidenceRows.some((item) => item.evidenceType === "USER_GUIDE"),
      qaContract: assessment.qaContract,
      qaGreen: evidenceRows.some((item) => item.evidenceType === "QA_PASSED") || (assessment.maturity === "COMMERCIAL_READY" && assessment.commercializable),
      e2eStatus: latestApplied?.e2eStatus || (assessment.commercializable ? "PASSED" : "NON_EXECUTED"),
      blocked: missing.length > 0,
      blockers: missing,
      lastEvolutionAt: latestApplied?.createdAt.toISOString() || evidenceRows[0]?.createdAt.toISOString() || `${assessment.evaluatedAt}T00:00:00.000Z`,
      commentFr: assessment.commentFr,
      commentEn: assessment.commentEn,
      history: historyRows.map((transition) => ({
        id: transition.id,
        fromMaturity: transition.fromMaturity as CommercialMaturity,
        toMaturity: transition.toMaturity as CommercialMaturity,
        reason: transition.reason,
        status: transition.status,
        actorId: transition.createdById,
        actorName: actorById.get(transition.createdById) || null,
        evidence: evidenceIds(transition.evidenceIdsJson).map((id) => evidenceById.get(id)).filter(isDefined).map((item) => ({ id: item.id, evidenceType: item.evidenceType, title: item.title, url: item.url })),
        createdAt: transition.createdAt.toISOString(),
        iterationCode: transition.iterationCode,
        pullRequestNumber: transition.pullRequestNumber,
        commitSha: transition.commitSha,
        productionDeploymentId: transition.productionDeploymentId,
        e2eStatus: transition.e2eStatus,
        ownerValidatedAt: transition.ownerValidatedAt?.toISOString() || null,
      })),
    };
  });

  return [...standardCards, ...erpCards].sort((left, right) => left.labelFr.localeCompare(right.labelFr, "fr"));
}

export async function getCommercialMaturityCard(moduleType: CommercialModuleType, moduleCode: string) {
  return (await listCommercialMaturityCards()).find((card) => card.moduleType === moduleType && card.moduleCode === moduleCode) || null;
}

export function canTransitionCommercialMaturity(from: CommercialMaturity, to: CommercialMaturity) {
  const fromIndex = COMMERCIAL_MATURITY_LEVELS.indexOf(from);
  const toIndex = COMMERCIAL_MATURITY_LEVELS.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return false;
  return toIndex < fromIndex || toIndex === fromIndex + 1;
}

export function asCommercialMaturity(value: StandardModuleMaturity | EnterpriseModuleCommercialMaturity | string): CommercialMaturity {
  return isMaturity(value) ? value : "BACKEND_READY";
}
