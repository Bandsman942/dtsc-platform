import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog, writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { HIRMS_ENVIRONMENTS } from "@/lib/enterprise/health-insurance-connectors/environments";
import { InsuranceConnectorError } from "@/lib/enterprise/health-insurance-connectors/registry";
import { reconcileHirmsInvoiceStatus } from "@/lib/enterprise/health-insurance-connectors/invoice-service";

type Params = { params: Promise<{ organizationId: string }> };
const bodySchema = z.object({
  environment: z.enum(HIRMS_ENVIRONMENTS),
  submissionId: z.string().cuid(),
}).strict();

/** Only linked DTSC invoice submissions may be queried by the authenticated tenant. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || session.activeContext !== "ORGANIZATION") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeOrganizationId !== organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null, sectorCode: { in: ["HEALTH_CARE", "PHARMACY"] } },
    select: { sectorCode: true },
  });
  if (!organization) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const allowed = organization.sectorCode === "HEALTH_CARE"
    ? Boolean((await getHealthInsuranceAccess({ session, organizationId, action: "read" }))?.canViewReports)
    : await canAccessPharmacySales(session.userId, organizationId, "view");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = await rateLimit(getRateLimitKey(req, `hirms-status:${organizationId}:${session.userId}`), 30, 60000, { failureMode: "closed" });
  if (!limit.ok) return NextResponse.json({ error: "HIRMS_LOCAL_RATE_LIMIT" }, { status: 429 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "HIRMS_INVOICE_STATUS_INPUT_INVALID" }, { status: 400 });
  try {
    const result = await reconcileHirmsInvoiceStatus(organizationId, parsed.data.environment, parsed.data.submissionId);
    await writeAuditLog({ userId: session.userId, action: "HIRMS_INVOICE_STATUS_CHECKED", entity: "EnterpriseHealthInsuranceInvoiceSubmission", request: req,
      metadata: { organizationId, environment: parsed.data.environment, submissionId: parsed.data.submissionId, schemaRecognized: result.schemaRecognized } });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, operation: "hirms-invoice-status", environment: parsed.data.environment } });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof InsuranceConnectorError ? error.code : "HIRMS_INVOICE_STATUS_UNAVAILABLE";
    const status = error instanceof InsuranceConnectorError ? error.httpStatus : 503;
    await writeApiLog({ request: req, startedAt, statusCode: status, userId: session.userId, metadata: { organizationId, operation: "hirms-invoice-status", errorCode: code } });
    return NextResponse.json({ error: code, message: "Le suivi HSL est momentanément indisponible ou l'identifiant externe doit être confirmé." },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}
