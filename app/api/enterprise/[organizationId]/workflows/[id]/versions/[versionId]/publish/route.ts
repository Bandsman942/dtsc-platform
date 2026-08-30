import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { getWorkflowVersionReadiness, publishWorkflowVersion } from "@/lib/enterprise/workflows/definitions";
import { EnterpriseWorkflowError, normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowPublishSchema } from "@/lib/enterprise/workflows/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string; versionId: string }> };

async function loadPublishReview(organizationId: string, definitionId: string, versionId: string) {
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({
    where: { id: definitionId, organizationId, archivedAt: null },
    select: { id: true, code: true, name: true, triggerType: true, triggerEntityType: true, triggerEventType: true },
  });
  if (!definition) throw new EnterpriseWorkflowError("Workflow introuvable.", 404, "WORKFLOW_DEFINITION_NOT_FOUND", "BUSINESS");
  const version = await prisma.enterpriseWorkflowVersion.findFirst({
    where: { id: versionId, organizationId, definitionId },
    include: {
      steps: { orderBy: { position: "asc" }, select: { id: true, code: true, name: true, stepType: true, position: true, configurationJson: true } },
      transitions: {
        orderBy: { priority: "asc" },
        include: { fromStep: { select: { code: true } }, toStep: { select: { code: true } } },
      },
    },
  });
  if (!version) throw new EnterpriseWorkflowError("Version de workflow introuvable.", 404, "WORKFLOW_VERSION_NOT_FOUND", "BUSINESS");
  if (version.status !== "DRAFT") throw new EnterpriseWorkflowError("Seule une version brouillon peut être revue avant publication.", 409, "WORKFLOW_VERSION_NOT_DRAFT", "BUSINESS");
  const readiness = await getWorkflowVersionReadiness(organizationId, definitionId, versionId);
  const snapshot = {
    definition,
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      configurationJson: version.configurationJson,
      steps: version.steps,
      transitions: version.transitions.map((transition) => ({
        id: transition.id,
        fromStepCode: transition.fromStep.code,
        toStepCode: transition.toStep.code,
        outcome: transition.outcome,
        priority: transition.priority,
        conditionJson: transition.conditionJson,
      })),
    },
    readiness,
  };
  const reviewToken = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return { ...snapshot, reviewToken };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id, versionId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canPublish) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const review = await loadPublishReview(organizationId, id, versionId);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-publish-review", definitionId: id, versionId } });
    return NextResponse.json({ review });
  } catch (error) {
    const normalized = normalizeWorkflowError(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-publish-review", definitionId: id, versionId, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-publish:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id, versionId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canPublish) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workflowPublishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "WORKFLOW_PUBLICATION_REVIEW_REQUIRED", message: "Ouvrez la revue de publication et confirmez la version affichée avant de publier." }, { status: 400 });
  if (parsed.data.reviewedVersionId !== versionId) return NextResponse.json({ error: "WORKFLOW_REVIEW_VERSION_MISMATCH", message: "La version revue ne correspond plus à la version à publier." }, { status: 409 });
  try {
    const review = await loadPublishReview(organizationId, id, versionId);
    if (!review.readiness.ready) throw new EnterpriseWorkflowError("Le workflow n’est pas prêt à être publié.", 409, "WORKFLOW_NOT_READY", "CONFIGURATION");
    if (review.reviewToken !== parsed.data.reviewToken) throw new EnterpriseWorkflowError("Le brouillon a changé depuis votre revue. Ouvrez une nouvelle revue avant de publier.", 409, "WORKFLOW_REVIEW_STALE", "CONFIGURATION");
    const version = await publishWorkflowVersion(organizationId, id, versionId, session.userId);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_PUBLISHED", entity: "EnterpriseWorkflowVersion", entityId: versionId, request: req, metadata: { organizationId, definitionId: id, versionNumber: version.versionNumber, reviewedVersionId: parsed.data.reviewedVersionId, reviewToken: parsed.data.reviewToken } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-publish", definitionId: id, versionId } });
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    const normalized = normalizeWorkflowError(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-publish", definitionId: id, versionId, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
