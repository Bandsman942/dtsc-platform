import { PaymentStatus } from "@prisma/client";
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
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw && Object.values(PaymentStatus).includes(statusRaw as PaymentStatus) ? statusRaw as PaymentStatus : undefined;
  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: period.start, lte: period.end }, ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { user: { select: { name: true, email: true } }, subscription: { include: { plan: { select: { name: true } } } } },
    take: CONSOLE_EXPORT_MAX_ROWS,
  });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_PAYMENTS_EXPORTED", entity: "Payment", reasonCode: access.reasonCode, riskLevel: "HIGH", request: req, metadata: { start: period.start.toISOString(), end: period.end.toISOString(), status: status || null, rows: payments.length, truncated: payments.length === CONSOLE_EXPORT_MAX_ROWS } });
  return createCsvResponse({
    filename: `dtsc-payments-${new Date().toISOString().slice(0, 10)}.csv`,
    headers: ["Date", "Reference", "Client", "Email", "Plan", "Montant", "Devise", "Statut", "Provider"],
    rows: payments.map((payment) => [payment.createdAt, payment.reference, payment.user.name, payment.user.email, payment.subscription?.plan.name || "", Number(payment.amount).toFixed(2), payment.currency, payment.status, payment.provider]),
  });
}
