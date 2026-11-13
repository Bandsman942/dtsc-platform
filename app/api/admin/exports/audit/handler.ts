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
  const action = url.searchParams.get("action") || undefined;
  const result = url.searchParams.get("result") || undefined;
  const logs = await prisma.auditLog.findMany({ where: { createdAt: { gte: period.start, lte: period.end }, ...(action ? { action: { contains: action, mode: "insensitive" } } : {}), ...(result ? { result } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true, requestId: true, userId: true, organizationId: true, action: true, entity: true, entityId: true, result: true, reasonCode: true, riskLevel: true }, take: CONSOLE_EXPORT_MAX_ROWS });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_AUDIT_EXPORTED", entity: "AuditLog", reasonCode: access.reasonCode, riskLevel: "CRITICAL", request: req, metadata: { start: period.start.toISOString(), end: period.end.toISOString(), action: action || null, result: result || null, rows: logs.length, truncated: logs.length === CONSOLE_EXPORT_MAX_ROWS } });
  return createCsvResponse({ filename: `dtsc-audit-${new Date().toISOString().slice(0, 10)}.csv`, headers: ["Date", "Request ID", "Acteur", "Organisation", "Action", "Entité", "Objet", "Résultat", "Reason code", "Risque"], rows: logs.map((log) => [log.createdAt, log.requestId, log.userId, log.organizationId, log.action, log.entity, log.entityId, log.result, log.reasonCode, log.riskLevel]) });
}
