import { publicWorkflowRun } from "@/lib/enterprise/workflows/public-run";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { listReadableWorkflowEntityTypes } from "@/lib/enterprise/workflows/source-access";
import { prisma } from "@/lib/prisma";
import { canUseFeature } from "@/lib/billing/entitlements";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const permittedEntityTypes = await listReadableWorkflowEntityTypes(session.userId, organizationId);
  const run = await prisma.enterpriseWorkflowRun.findFirst({ where: { id, organizationId, sourceEntityType: { in: permittedEntityTypes }, ...(access.canViewAllRuns ? {} : { OR: [{ startedByUserId: session.userId }, { stepRuns: { some: { assignedUserId: session.userId } } }] }) }, include: { definition: true, version: { select: { id: true, versionNumber: true, status: true } }, stepRuns: { orderBy: { createdAt: "asc" }, include: { step: { select: { code: true, name: true, stepType: true, position: true } }, actionAttempts: { orderBy: { createdAt: "asc" } }, approvals: { select: { id: true, status: true, approverUserId: true, requestedAt: true, decidedAt: true } } } }, events: { orderBy: { createdAt: "asc" } } } });
  if (!run) return NextResponse.json({ error: "WORKFLOW_RUN_NOT_FOUND" }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-run", runId: id } });
  // Assignment grants participation, not access to every decision, actor and audit event.
  const visible = access.canViewAllRuns || run.startedByUserId === session.userId
    ? run
    : { ...run, events: [], stepRuns: run.stepRuns.filter((stepRun) => stepRun.assignedUserId === session.userId) };
  // Authorized reverse navigation to Activities, without revealing another
  // member's activity form to workflow step participants.
  let sourceActivityId: string | null = null;
  if (run.sourceEntityType === "EnterpriseRequest" && (await canUseFeature(organizationId, "enterprise-activities")).allowed) {
    const origin = await prisma.enterpriseRequest.findFirst({
      where: { organizationId, id: run.sourceEntityId, sourceModule: "ENTERPRISE_ACTIVITIES",
        sourceEntityType: "EnterpriseActivityRequest", archivedAt: null },
      select: { sourceEntityId: true },
    });
    if (origin?.sourceEntityId) {
      const activity = await prisma.enterpriseActivityRequest.findFirst({
        where: {
          id: origin.sourceEntityId, organizationId,
          ...(access.canViewAllRuns ? {} : { OR: [{ createdById: session.userId }, { assignedToUserId: session.userId }] }),
        },
        select: { id: true },
      });
      sourceActivityId = activity?.id || null;
    }
  }
  return NextResponse.json({ run: { ...publicWorkflowRun(visible), sourceActivityId }, permissions: access });
}
