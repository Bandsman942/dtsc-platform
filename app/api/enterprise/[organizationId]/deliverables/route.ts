import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const readAccess = await getEnterpriseCommonDomainAccess({
    session,
    organizationId,
    moduleCode: "TIME_DELIVERABLES",
    action: "read",
  });
  if (!readAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [writeAccess, manageAccess] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_DELIVERABLES", action: "write" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_DELIVERABLES", action: "manage" }),
  ]);

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  const where: Prisma.EnterpriseProjectDeliverableWhereInput = {
    organizationId,
    project: { archivedAt: null },
    ...(status ? { status } : {}),
    ...(projectId ? { projectId } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { project: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rawItems, total, submitted, accepted, overdue] = await Promise.all([
    prisma.enterpriseProjectDeliverable.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: { select: { id: true, reference: true, name: true, status: true } },
        milestone: { select: { id: true, reference: true, name: true, status: true, dueDate: true } },
      },
    }),
    prisma.enterpriseProjectDeliverable.count({ where }),
    prisma.enterpriseProjectDeliverable.count({
      where: { organizationId, project: { archivedAt: null }, status: "SUBMITTED" },
    }),
    prisma.enterpriseProjectDeliverable.count({
      where: { organizationId, project: { archivedAt: null }, status: "ACCEPTED" },
    }),
    prisma.enterpriseProjectDeliverable.count({
      where: {
        organizationId,
        project: { archivedAt: null },
        dueDate: { lt: new Date() },
        status: { notIn: ["ACCEPTED", "REJECTED"] },
      },
    }),
  ]);

  const deliverableIds = rawItems.map((item) => item.id);
  const approvedEntries = deliverableIds.length
    ? await prisma.enterpriseTimesheetEntry.findMany({
        where: {
          organizationId,
          deliverableId: { in: deliverableIds },
          timesheet: { status: "APPROVED", archivedAt: null },
        },
        select: { deliverableId: true, approvedMinutes: true, billable: true },
      })
    : [];
  const timeByDeliverable = new Map<string, { approvedMinutes: number; billableMinutes: number }>();
  for (const entry of approvedEntries) {
    if (!entry.deliverableId) continue;
    const current = timeByDeliverable.get(entry.deliverableId) || { approvedMinutes: 0, billableMinutes: 0 };
    const minutes = entry.approvedMinutes || 0;
    current.approvedMinutes += minutes;
    if (entry.billable) current.billableMinutes += minutes;
    timeByDeliverable.set(entry.deliverableId, current);
  }

  const items = rawItems.map((item) => {
    const independentReviewer = item.createdByUserId !== session.userId;
    const time = timeByDeliverable.get(item.id) || { approvedMinutes: 0, billableMinutes: 0 };
    return {
      ...item,
      approvedMinutes: time.approvedMinutes,
      billableMinutes: time.billableMinutes,
      canSubmit: Boolean(writeAccess && ["DRAFT", "CHANGES_REQUESTED"].includes(item.status)),
      canAccept: Boolean(manageAccess && independentReviewer && item.status === "SUBMITTED"),
      canRequestChanges: Boolean(manageAccess && independentReviewer && item.status === "SUBMITTED"),
      canReject: Boolean(manageAccess && independentReviewer && item.status === "SUBMITTED"),
    };
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "deliverables", page },
  });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { submitted, accepted, overdue },
    canWrite: Boolean(writeAccess),
    canManage: Boolean(manageAccess),
  });
}