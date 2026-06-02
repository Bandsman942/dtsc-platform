import { prisma } from "@/lib/prisma";
import { classifyAuditSeverity } from "@/lib/console/console-utils";

export async function getConsoleAuditDataset({ loadAuditDetails }: { loadAuditDetails: boolean }) {
  const [auditLogs, apiLogs, webhookEvents] = await Promise.all([
    loadAuditDetails ? prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      take: 300,
    }) : Promise.resolve([]),
    loadAuditDetails ? prisma.apiLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }) : Promise.resolve([]),
    loadAuditDetails ? prisma.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }) : Promise.resolve([]),
  ]);

  const logAuditItems = [
    ...auditLogs.map((event) => ({
      id: event.id,
      source: "Audit" as const,
      title: `${event.action} · ${event.entity}`,
      detail: event.user ? `${event.user.name} · ${event.user.email}` : "Action système ou utilisateur supprimé",
      status: classifyAuditSeverity(event.action),
      createdAt: event.createdAt.toISOString(),
    })),
    ...apiLogs.map((event) => ({
      id: event.id,
      source: "API" as const,
      title: `${event.method} · ${event.path}`,
      detail: event.userId ? `Utilisateur: ${event.userId}` : "Requête système ou publique",
      status: `HTTP ${event.statusCode}`,
      createdAt: event.createdAt.toISOString(),
    })),
    ...webhookEvents.map((event) => ({
      id: event.id,
      source: "Webhook" as const,
      title: `${event.provider} · ${event.eventType}`,
      detail: event.lastError || "Événement reçu et journalisé",
      status: event.status,
      createdAt: event.createdAt.toISOString(),
    })),
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());

  return { auditLogs, apiLogs, webhookEvents, logAuditItems };
}
