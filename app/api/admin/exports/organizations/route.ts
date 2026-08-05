import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { CONSOLE_EXPORT_MAX_ROWS, createCsvResponse, parseExportPeriod } from "@/lib/console/console-export";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.AUDIT_EXPORT);
  if (access.response) return access.response;
  const url = new URL(req.url);
  const period = parseExportPeriod(url);
  if (!period) return Response.json({ error: "Invalid period", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const status = url.searchParams.get("status") || undefined;
  const organizations = await prisma.organization.findMany({
    where: { organizationType: "CLIENT", deletedAt: null, createdAt: { gte: period.start, lte: period.end }, ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { businessSector: { select: { code: true, labelFr: true } }, subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } }, _count: { select: { members: true, supportTickets: true } } },
    take: CONSOLE_EXPORT_MAX_ROWS,
  });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_ORGANIZATIONS_EXPORTED", entity: "Organization", reasonCode: access.reasonCode, riskLevel: "HIGH", request: req, metadata: { start: period.start.toISOString(), end: period.end.toISOString(), status: status || null, rows: organizations.length, truncated: organizations.length === CONSOLE_EXPORT_MAX_ROWS } });
  return createCsvResponse({ filename: `dtsc-organizations-${new Date().toISOString().slice(0, 10)}.csv`, headers: ["Identifiant", "Nom", "Slug", "Statut", "Secteur", "Plan", "Abonnement", "Membres", "Tickets", "Créée le"], rows: organizations.map((organization) => [organization.id, organization.name, organization.slug, organization.status, organization.businessSector?.labelFr || organization.sector || "", organization.subscriptions[0]?.plan.name || "", organization.subscriptions[0]?.status || "", organization._count.members, organization._count.supportTickets, organization.createdAt]) });
}
