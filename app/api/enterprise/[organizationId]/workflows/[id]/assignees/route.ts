import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { requireWorkflowDefinitionSourceAccess } from "@/lib/enterprise/workflows/source-access";
import { workflowSourceModule } from "@/lib/enterprise/workflows/runtime-utils";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

/** Tenant-scoped, entitlement-aware editor options. Never a grant:
 * the workflow runner rechecks live approval permissions at execution.
 */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canEditDraft) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({
    where: { id, organizationId, archivedAt: null },
    select: { triggerEntityType: true },
  });
  if (!definition?.triggerEntityType) return NextResponse.json({ error: "WORKFLOW_SOURCE_MODULE_UNKNOWN" }, { status: 409 });
  try {
    await requireWorkflowDefinitionSourceAccess({ userId: session.userId, organizationId, definitionId: id });
    const moduleCode = workflowSourceModule(definition.triggerEntityType);
    const members = await prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      select: {
        userId: true, role: true, positionCode: true, positionTitle: true,
        user: { select: { name: true } },
        organizationRoleAssignments: {
          where: { revokedAt: null, role: { isActive: true, archivedAt: null } },
          select: { role: { select: { code: true } } },
        },
      },
      orderBy: { user: { name: "asc" } }, take: 250,
    });
    const decisions = await Promise.all(members.map(async (member) => ({
      member, decision: await resolveEnterpriseModuleAccess({
        userId: member.userId, organizationId, moduleCode, action: "approve",
      }),
    })));
    const eligible = decisions.filter(({ decision }) => decision.allowed).map(({ member }) => member);
    const countByRole = new Map<string, number>();
    for (const member of eligible) {
      const codes = new Set([
        member.role, member.positionCode,
        ...member.organizationRoleAssignments.map((assignment) => assignment.role.code),
      ].filter((value): value is string => typeof value === "string" && Boolean(value)));
      for (const code of codes) countByRole.set(code, (countByRole.get(code) || 0) + 1);
    }
    const departments = await prisma.enterpriseDepartment.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, labelFr: true, responsibleUserId: true },
      orderBy: { labelFr: "asc" }, take: 250,
    });
    const eligibleIds = new Set(eligible.map((member) => member.userId));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt,
      metadata: { organizationId, domain: "workflow-assignment-options", moduleCode, count: eligible.length },
    });
    return NextResponse.json({
      moduleCode,
      members: eligible.map((member) => ({
        id: member.userId, label: [member.user.name, member.positionTitle].filter(Boolean).join(" · "),
        isCurrentUser: member.userId === session.userId,
      })),
      roles: [...countByRole].sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => ({ id, label: id + " (" + count + ")" })),
      departments: departments.map((department) => ({
        id: department.id, label: department.labelFr,
        hasEligibleManager: Boolean(department.responsibleUserId && eligibleIds.has(department.responsibleUserId)),
      })),
    });
  } catch {
    return NextResponse.json({
      error: "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED",
      message: "Vous n’êtes pas autorisé à configurer les validations de ce module.",
    }, { status: 403 });
  }
}
