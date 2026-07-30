import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseApprovalVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseApproval } from "@/lib/enterprise/core-v2/service";
import { enterpriseApprovalCreateSchema } from "@/lib/enterprise/core-v2/validators";
import { createEnterpriseBudgetApproval } from "@/lib/enterprise/finance/budget-service";
import { createEnterpriseExpenseApproval } from "@/lib/enterprise/finance/expense-service";
import { createEnterprisePurchaseApproval } from "@/lib/enterprise/procurement/purchase-service";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
type ApprovalTargetSummary = { type: string; id: string; title: string; priority?: string | null; status?: string | null };

async function targetSummaries(organizationId: string, search = "") {
  const contains = search ? { contains: search, mode: "insensitive" as const } : undefined;
  const [tasks, requests, meetings, purchases, budgets, expenses, incidents] = await Promise.all([
    prisma.enterpriseTask.findMany({ where: { organizationId, archivedAt: null, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, priority: true, status: true }, take: search ? 80 : 0 }),
    prisma.enterpriseRequest.findMany({ where: { organizationId, archivedAt: null, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, priority: true, status: true }, take: search ? 80 : 0 }),
    prisma.enterpriseMeeting.findMany({ where: { organizationId, archivedAt: null, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, status: true }, take: search ? 80 : 0 }),
    prisma.enterprisePurchase.findMany({ where: { organizationId, archivedAt: null, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, priority: true, status: true }, take: search ? 80 : 0 }),
    prisma.enterpriseBudget.findMany({ where: { organizationId, archivedAt: null, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, status: true }, take: search ? 80 : 0 }),
    prisma.enterpriseExpense.findMany({ where: { organizationId, archivedAt: null, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, status: true }, take: search ? 80 : 0 }),
    prisma.pharmacyQualityIncident.findMany({ where: { organizationId, ...(contains ? { title: contains } : {}) }, select: { id: true, title: true, priority: true, status: true }, take: search ? 80 : 0 }),
  ]);
  const map = new Map<string, ApprovalTargetSummary>();
  for (const item of tasks) map.set(`EnterpriseTask:${item.id}`, { type: "EnterpriseTask", ...item });
  for (const item of requests) map.set(`EnterpriseRequest:${item.id}`, { type: "EnterpriseRequest", ...item });
  for (const item of meetings) map.set(`EnterpriseMeeting:${item.id}`, { type: "EnterpriseMeeting", ...item });
  for (const item of purchases) map.set(`EnterprisePurchase:${item.id}`, { type: "EnterprisePurchase", ...item });
  for (const item of budgets) map.set(`EnterpriseBudget:${item.id}`, { type: "EnterpriseBudget", ...item });
  for (const item of expenses) map.set(`EnterpriseExpense:${item.id}`, { type: "EnterpriseExpense", ...item });
  for (const item of incidents) map.set(`PharmacyQualityIncident:${item.id}`, { type: "PharmacyQualityIncident", ...item });
  return map;
}

async function canAccessTarget(organizationId: string, userId: string, canManage: boolean, targetEntityType: string, targetEntityId: string) {
  if (canManage) return true;
  if (targetEntityType === "EnterpriseTask") return Boolean(await prisma.enterpriseTask.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null, OR: [{ createdByUserId: userId }, { assignedToUserId: userId }] }, select: { id: true } }));
  if (targetEntityType === "EnterpriseRequest") return Boolean(await prisma.enterpriseRequest.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null, OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }] }, select: { id: true } }));
  if (targetEntityType === "EnterpriseMeeting") return Boolean(await prisma.enterpriseMeeting.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null, OR: [{ organizerUserId: userId }, { participants: { some: { userId } } }] }, select: { id: true } }));
  if (targetEntityType === "EnterprisePurchase") return Boolean(await prisma.enterprisePurchase.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null, OR: [{ requestedByUserId: userId }, { buyerUserId: userId }, { createdByUserId: userId }] }, select: { id: true } }));
  if (targetEntityType === "EnterpriseBudget") return Boolean(await prisma.enterpriseBudget.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null, createdByUserId: userId }, select: { id: true } }));
  if (targetEntityType === "EnterpriseExpense") return Boolean(await prisma.enterpriseExpense.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null, OR: [{ requestedByUserId: userId }, { createdByUserId: userId }] }, select: { id: true } }));
  if (targetEntityType === "PharmacyQualityIncident") return Boolean(await prisma.pharmacyQualityIncident.findFirst({ where: { id: targetEntityId, organizationId, OR: [{ reportedById: userId }, { assignedToId: userId }, { createdById: userId }] }, select: { id: true } }));
  return false;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1); const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20)); const queue = url.searchParams.get("queue") || "pending"; const explicitStatus = url.searchParams.get("status")?.trim() || ""; const targetEntityType = url.searchParams.get("entityType")?.trim() || ""; const search = url.searchParams.get("search")?.trim() || ""; const from = url.searchParams.get("from"); const to = url.searchParams.get("to"); const filters: Prisma.EnterpriseApprovalWhereInput[] = [];
  if (queue === "pending") filters.push({ approverUserId: session.userId, status: "PENDING" });
  if (queue === "treated") filters.push({ approverUserId: session.userId, status: { in: ["APPROVED", "REJECTED", "CANCELLED"] } });
  if (explicitStatus) filters.push({ status: explicitStatus }); if (targetEntityType) filters.push({ targetEntityType }); if (from || to) { const requestedAt: { gte?: Date; lte?: Date } = {}; if (from) requestedAt.gte = new Date(from); if (to) requestedAt.lte = new Date(to); filters.push({ requestedAt }); }
  const matchingTargets = search ? await targetSummaries(organizationId, search) : new Map<string, ApprovalTargetSummary>();
  if (search) filters.push({ OR: [{ decisionComment: { contains: search, mode: "insensitive" } }, ...[...matchingTargets.values()].map((target) => ({ targetEntityType: target.type, targetEntityId: target.id }))] });
  const where: Prisma.EnterpriseApprovalWhereInput = { AND: [enterpriseApprovalVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), ...filters] };
  const [items, total] = await Promise.all([prisma.enterpriseApproval.findMany({ where, orderBy: { requestedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.enterpriseApproval.count({ where })]);
  const allTargetMap = search ? matchingTargets : await resolveTargets(organizationId, items); const enriched = items.map((item) => ({ ...item, target: allTargetMap.get(`${item.targetEntityType}:${item.targetEntityId}`) || null }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", queue, page, pageSize } });
  return NextResponse.json({ items: enriched, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage, currentUserId: session.userId });
}

async function resolveTargets(organizationId: string, approvals: Array<{ targetEntityType: string; targetEntityId: string }>) {
  const byType = new Map<string, string[]>(); for (const approval of approvals) byType.set(approval.targetEntityType, [...(byType.get(approval.targetEntityType) || []), approval.targetEntityId]);
  const [tasks, requests, meetings, purchases, budgets, expenses, incidents] = await Promise.all([
    prisma.enterpriseTask.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseTask") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
    prisma.enterpriseRequest.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseRequest") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
    prisma.enterpriseMeeting.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseMeeting") || [] } }, select: { id: true, title: true, status: true } }),
    prisma.enterprisePurchase.findMany({ where: { organizationId, id: { in: byType.get("EnterprisePurchase") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
    prisma.enterpriseBudget.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseBudget") || [] } }, select: { id: true, title: true, status: true } }),
    prisma.enterpriseExpense.findMany({ where: { organizationId, id: { in: byType.get("EnterpriseExpense") || [] } }, select: { id: true, title: true, status: true } }),
    prisma.pharmacyQualityIncident.findMany({ where: { organizationId, id: { in: byType.get("PharmacyQualityIncident") || [] } }, select: { id: true, title: true, priority: true, status: true } }),
  ]);
  const map = new Map<string, ApprovalTargetSummary>(); for (const item of tasks) map.set(`EnterpriseTask:${item.id}`, { type: "EnterpriseTask", ...item }); for (const item of requests) map.set(`EnterpriseRequest:${item.id}`, { type: "EnterpriseRequest", ...item }); for (const item of meetings) map.set(`EnterpriseMeeting:${item.id}`, { type: "EnterpriseMeeting", ...item }); for (const item of purchases) map.set(`EnterprisePurchase:${item.id}`, { type: "EnterprisePurchase", ...item }); for (const item of budgets) map.set(`EnterpriseBudget:${item.id}`, { type: "EnterpriseBudget", ...item }); for (const item of expenses) map.set(`EnterpriseExpense:${item.id}`, { type: "EnterpriseExpense", ...item }); for (const item of incidents) map.set(`PharmacyQualityIncident:${item.id}`, { type: "PharmacyQualityIncident", ...item }); return map;
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(req, `enterprise-approvals:${session.userId}`), 100, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 }); const { organizationId } = await params; const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "submit" }); if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const parsed = enterpriseApprovalCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Validation invalide." }, { status: 400 }); const data = parsed.data;
  if (!(await canAccessTarget(organizationId, session.userId, access.canManage, data.targetEntityType, data.targetEntityId))) return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas demander une validation sur cet objet." }, { status: 403 });
  const pendingForTarget = await prisma.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: data.targetEntityType, targetEntityId: data.targetEntityId, status: "PENDING", archivedAt: null }, select: { id: true } }); if (pendingForTarget) return NextResponse.json({ error: "Pending approval exists", message: "Une validation est déjà en attente pour cet objet. Les chaînes multi-étapes viendront avec le Workflow Engine." }, { status: 409 });
  try {
    const approval = data.targetEntityType === "EnterprisePurchase" ? await createEnterprisePurchaseApproval({ organizationId, purchaseId: data.targetEntityId, actorUserId: session.userId, approverUserId: data.approverUserId }) : data.targetEntityType === "EnterpriseBudget" ? await createEnterpriseBudgetApproval({ organizationId, budgetId: data.targetEntityId, actorUserId: session.userId, approverUserId: data.approverUserId }) : data.targetEntityType === "EnterpriseExpense" ? await createEnterpriseExpenseApproval({ organizationId, expenseId: data.targetEntityId, actorUserId: session.userId, approverUserId: data.approverUserId }) : await createEnterpriseApproval({ organizationId, actorUserId: session.userId, targetEntityType: data.targetEntityType, targetEntityId: data.targetEntityId, approverUserId: data.approverUserId });
    await notifyUser({ userId: approval.approverUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: "Validation requise", body: "Une décision vous a été attribuée.", targetUrl: "/enterprise-modules/VALIDATIONS" }); await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_APPROVAL_REQUESTED", entity: "EnterpriseApproval", entityId: approval.id, request: req, metadata: { organizationId, targetEntityType: approval.targetEntityType, targetEntityId: approval.targetEntityId, approverUserId: approval.approverUserId } }); await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals" } }); return NextResponse.json({ ok: true, approval }, { status: 201 });
  } catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
