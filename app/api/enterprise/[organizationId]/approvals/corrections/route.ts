import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

type TargetSummary = { type: string; id: string; title: string; priority?: string | null; status?: string | null };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const entityType = url.searchParams.get("entityType")?.trim() || "";
  const search = url.searchParams.get("search")?.trim() || "";
  const filters: Prisma.EnterpriseApprovalWhereInput[] = [
    { requestedByUserId: session.userId, status: "CORRECTION_REQUESTED" },
  ];
  if (entityType) filters.push({ targetEntityType: entityType });
  const where: Prisma.EnterpriseApprovalWhereInput = { organizationId, archivedAt: null, AND: filters };
  const [items, total] = await Promise.all([
    prisma.enterpriseApproval.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseApproval.count({ where }),
  ]);
  const targets = await resolveTargets(organizationId, items);
  const enriched = items
    .map((item) => ({ ...item, target: targets.get(`${item.targetEntityType}:${item.targetEntityId}`) || null }))
    .filter((item) => !search || [item.target?.title, item.decisionComment, item.targetEntityType].filter(Boolean).join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approval-corrections", page, pageSize } });
  return NextResponse.json({ items: enriched, pagination: { page, pageSize, total: search ? enriched.length : total, pageCount: Math.max(1, Math.ceil((search ? enriched.length : total) / pageSize)) }, canManage: access.canManage, currentUserId: session.userId });
}

async function resolveTargets(organizationId: string, approvals: Array<{ targetEntityType: string; targetEntityId: string }>) {
  const byType = new Map<string, string[]>();
  for (const approval of approvals) byType.set(approval.targetEntityType, [...(byType.get(approval.targetEntityType) || []), approval.targetEntityId]);
  const [tasks, requests, meetings, purchases, budgets, expenses, incidents] = await Promise.all([
    prisma.enterpriseTask.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseTask") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
    prisma.enterpriseRequest.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseRequest") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
    prisma.enterpriseMeeting.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseMeeting") || [] } }, select: { id: true, title: true, status: true } }),
    prisma.enterprisePurchase.findMany({ where: { organizationId, id: { in: byType.get("EnterprisePurchase") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
    prisma.enterpriseBudget.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseBudget") || [] } }, select: { id: true, title: true, status: true } }),
    prisma.enterpriseExpense.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseExpense") || [] } }, select: { id: true, title: true, status: true } }),
    prisma.pharmacyQualityIncident.findMany({ where: { organizationId, id: { in: byType.get("PharmacyQualityIncident") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
  ]);
  const map = new Map<string, TargetSummary>();
  for (const item of tasks) map.set(`EnterpriseTask:${item.id}`, { type: "EnterpriseTask", ...item });
  for (const item of requests) map.set(`EnterpriseRequest:${item.id}`, { type: "EnterpriseRequest", ...item });
  for (const item of meetings) map.set(`EnterpriseMeeting:${item.id}`, { type: "EnterpriseMeeting", ...item });
  for (const item of purchases) map.set(`EnterprisePurchase:${item.id}`, { type: "EnterprisePurchase", ...item });
  for (const item of budgets) map.set(`EnterpriseBudget:${item.id}`, { type: "EnterpriseBudget", ...item });
  for (const item of expenses) map.set(`EnterpriseExpense:${item.id}`, { type: "EnterpriseExpense", ...item });
  for (const item of incidents) map.set(`PharmacyQualityIncident:${item.id}`, { type: "PharmacyQualityIncident", ...item });
  return map;
}
