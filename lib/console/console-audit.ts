import { Prisma } from "@prisma/client";
import { buildConsolePagination, normalizeConsoleSearch, parseConsolePagination } from "@/lib/console/console-pagination";
import { redactConsoleText, redactConsoleValue } from "@/lib/console/console-redaction";
import { classifyAuditSeverity } from "@/lib/console/console-utils";
import { prisma } from "@/lib/prisma";

export async function getConsoleAuditDataset(input: {
  page?: string | number | null;
  pageSize?: string | number | null;
  search?: string | null;
  source?: "AUDIT" | "API" | "WEBHOOK" | null;
  result?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  statusCode?: number | null;
  provider?: string | null;
  requestId?: string | null;
} = {}) {
  const paging = parseConsolePagination({ page: input.page, pageSize: input.pageSize, defaultPageSize: 30, maxPageSize: 100 });
  const search = normalizeConsoleSearch(input.search);
  const source = input.source || "AUDIT";

  if (source === "API") {
    const where: Prisma.ApiLogWhereInput = {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
      ...(input.requestId ? { metadata: { path: ["requestId"], equals: input.requestId } } : {}),
      ...(search ? { OR: [{ path: { contains: search, mode: "insensitive" } }, { method: { contains: search, mode: "insensitive" } }] } : {}),
    };
    const [apiLogs, total] = await Promise.all([
      prisma.apiLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }),
      prisma.apiLog.count({ where }),
    ]);
    const logAuditItems = apiLogs.map((event) => ({
      id: event.id, source: "API" as const, title: `${event.method} · ${event.path}`, detail: event.userId ? `Utilisateur: ${event.userId}` : "Requête système ou publique",
      status: `HTTP ${event.statusCode}`, createdAt: event.createdAt.toISOString(), requestId: extractRequestId(event.metadata), metadata: redactConsoleValue(event.metadata),
    }));
    return baseResult({ apiLogs, logAuditItems, total, paging, source, search });
  }

  if (source === "WEBHOOK") {
    const where: Prisma.WebhookEventWhereInput = {
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.result ? { status: input.result } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(search ? { OR: [{ provider: { contains: search, mode: "insensitive" } }, { eventType: { contains: search, mode: "insensitive" } }, { status: { contains: search, mode: "insensitive" } }, { lastError: { contains: search, mode: "insensitive" } }] } : {}),
    };
    const [webhookEvents, total] = await Promise.all([
      prisma.webhookEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }),
      prisma.webhookEvent.count({ where }),
    ]);
    const logAuditItems = webhookEvents.map((event) => ({
      id: event.id, source: "Webhook" as const, title: `${event.provider} · ${event.eventType}`, detail: redactConsoleText(event.lastError) || "Événement reçu et journalisé",
      status: event.status, createdAt: event.createdAt.toISOString(), requestId: event.requestId, metadata: redactConsoleValue({ payload: event.payload, attempts: event.attempts, processedAt: event.processedAt, appliedAt: event.appliedAt }),
    }));
    return baseResult({ webhookEvents, logAuditItems, total, paging, source, search });
  }

  const where: Prisma.AuditLogWhereInput = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.result ? { result: input.result } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(search ? { OR: [{ action: { contains: search, mode: "insensitive" } }, { entity: { contains: search, mode: "insensitive" } }, { entityId: { contains: search, mode: "insensitive" } }, { reasonCode: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [auditLogs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { user: { select: { id: true, name: true, email: true, role: true } } }, skip: paging.skip, take: paging.take }),
    prisma.auditLog.count({ where }),
  ]);
  const logAuditItems = auditLogs.map((event) => ({
    id: event.id, source: "Audit" as const, title: `${event.action} · ${event.entity}`, detail: event.user ? `${event.user.name} · ${event.user.email}` : "Action système ou utilisateur supprimé",
    status: event.result || classifyAuditSeverity(event.action), createdAt: event.createdAt.toISOString(), requestId: event.requestId,
    metadata: redactConsoleValue({ before: event.beforeJson, after: event.afterJson, metadata: event.metadata, reasonCode: event.reasonCode, organizationId: event.organizationId }),
  }));
  return baseResult({ auditLogs, logAuditItems, total, paging, source, search });
}

function extractRequestId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).requestId;
  return typeof value === "string" ? value : null;
}

function baseResult(input: {
  auditLogs?: unknown[]; apiLogs?: unknown[]; webhookEvents?: unknown[]; logAuditItems: unknown[]; total: number;
  paging: { page: number; pageSize: number }; source: string; search: string;
}) {
  return {
    auditLogs: input.auditLogs || [], apiLogs: input.apiLogs || [], webhookEvents: input.webhookEvents || [], logAuditItems: input.logAuditItems,
    pagination: buildConsolePagination(input.total, input.paging.page, input.paging.pageSize),
    filters: { source: input.source, search: input.search }, freshness: new Date().toISOString(),
  };
}
