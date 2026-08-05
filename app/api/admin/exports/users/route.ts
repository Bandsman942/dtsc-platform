import { UserRole, UserStatus } from "@prisma/client";
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
  const roleRaw = url.searchParams.get("role");
  const statusRaw = url.searchParams.get("status");
  const role = roleRaw && Object.values(UserRole).includes(roleRaw as UserRole) ? roleRaw as UserRole : undefined;
  const status = statusRaw && Object.values(UserStatus).includes(statusRaw as UserStatus) ? statusRaw as UserStatus : undefined;
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: period.start, lte: period.end }, ...(role ? { role } : {}), ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, name: true, email: true, role: true, status: true, locale: true, createdAt: true, updatedAt: true, _count: { select: { organizationMemberships: true, supportTickets: true } } },
    take: CONSOLE_EXPORT_MAX_ROWS,
  });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_USERS_EXPORTED", entity: "User", reasonCode: access.reasonCode, riskLevel: "HIGH", request: req, metadata: { start: period.start.toISOString(), end: period.end.toISOString(), role: role || null, status: status || null, rows: users.length, truncated: users.length === CONSOLE_EXPORT_MAX_ROWS } });
  return createCsvResponse({ filename: `dtsc-users-${new Date().toISOString().slice(0, 10)}.csv`, headers: ["Identifiant", "Nom", "Email", "Rôle", "Statut", "Locale", "Organisations", "Tickets", "Créé le", "Mis à jour le"], rows: users.map((user) => [user.id, user.name, user.email, user.role, user.status, user.locale, user._count.organizationMemberships, user._count.supportTickets, user.createdAt, user.updatedAt]) });
}
