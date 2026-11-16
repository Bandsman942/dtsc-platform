import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canUseFeature } from "@/lib/billing/entitlements";
import { financeBusinessDateRange } from "@/lib/enterprise/accounting/http";
import { projectEnterpriseActivityRequestWorkflows } from "@/lib/enterprise/enterprise-activity-workflow-links";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const statuses = new Set(["DRAFT", "SUBMITTED", "ASSIGNED", "IN_REVIEW", "IN_PROGRESS", "WAITING_REQUESTER", "APPROVED", "REJECTED", "RESOLVED", "FULFILLED", "REOPENED", "CLOSED", "COMPLETED", "CANCELLED"]);

/** Canonical activity requests: paginated and subject to the same member visibility as the enterprise-activities loader. */
export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const entitlement = await canUseFeature(organizationId, "enterprise-activities");
  if (!entitlement.allowed) return NextResponse.json({ error: "FEATURE_UNAVAILABLE", message: entitlement.message }, { status: 403 });

  const range = financeBusinessDateRange(request);
  if (!range.ok) return range.response;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || "20") || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const id = url.searchParams.get("id")?.trim() || "";
  if (search.length > 120 || (status && !statuses.has(status))) {
    return NextResponse.json({ error: "INVALID_FILTER", message: "Affinez la recherche ou choisissez un statut proposé." }, { status: 400 });
  }
  const role = membership.role;
  const canSeeAll = role === "OWNER" || role === "ADMIN_ENTREPRISE" || role === "ADMIN_ENTERPRISE" || role === "MANAGER";
  const where: Prisma.EnterpriseActivityRequestWhereInput = {
    organizationId,
    ...(canSeeAll ? {} : { OR: [{ createdById: session.userId }, { assignedToUserId: session.userId }] }),
    ...(id ? { id } : {}),
    ...(status ? { status } : {}),
    ...(search ? { AND: [{ OR: [{ title: { contains: search, mode: "insensitive" as const } }, { description: { contains: search, mode: "insensitive" as const } }, { blockCode: { contains: search, mode: "insensitive" as const } }] }] } : {}),
    ...(range.from || range.to ? { createdAt: { gte: range.from || undefined, lte: range.to || undefined } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseActivityRequest.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { createdBy: { select: { name: true, email: true } }, block: { select: { labelFr: true, labelEn: true, icon: true } } },
    }),
    prisma.enterpriseActivityRequest.count({ where }),
  ]);
  const links = await projectEnterpriseActivityRequestWorkflows({
    organizationId, userId: session.userId, activityIds: items.map((item) => item.id),
  });
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "enterprise-activity-requests", page, pageSize } });
  return NextResponse.json({
    items: items.map((item) => ({ ...item, workflowLink: links.get(item.id) || null })),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
