import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { HIRMS_ENVIRONMENTS } from "@/lib/enterprise/health-insurance-connectors/environments";
import { InsuranceConnectorError } from "@/lib/enterprise/health-insurance-connectors/registry";
import { pollHirmsOcrJob } from "@/lib/enterprise/health-insurance-connectors/ocr-service";

type Params = { params: Promise<{ organizationId: string }> };
const input = z.object({ environment: z.enum(HIRMS_ENVIRONMENTS), id: z.string().cuid() }).strict();
export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || session.activeContext !== "ORGANIZATION") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeOrganizationId !== organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const org = await prisma.organization.findFirst({
    where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null, sectorCode: { in: ["HEALTH_CARE","PHARMACY"] } }, select: { sectorCode: true },
  });
  if (!org) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const allowed = org.sectorCode === "HEALTH_CARE"
    ? Boolean((await getHealthInsuranceAccess({ session, organizationId, action: "read" }))?.canViewReports)
    : await canAccessPharmacySales(session.userId, organizationId, "view");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = await rateLimit(`hirms-ocr-poll:${organizationId}:${session.userId}`, 30, 60000, { failureMode: "closed" });
  if (!limit.ok) return NextResponse.json({ error: "HIRMS_OCR_POLL_RATE_LIMITED" }, { status: 429 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "HIRMS_OCR_STATUS_INPUT_INVALID" }, { status: 400 });
  try {
    const result = await pollHirmsOcrJob(organizationId, parsed.data.environment, parsed.data.id);
    await writeAuditLog({ userId: session.userId, action: "HIRMS_OCR_JOB_STATUS_CHECKED", entity: "EnterpriseHealthInsuranceOcrJob", request: req,
      metadata: { organizationId, environment: parsed.data.environment, ocrJobId: parsed.data.id, schemaRecognized: result.schemaRecognized } });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch(error) {
    const code = error instanceof InsuranceConnectorError ? error.code : "HIRMS_OCR_POLL_UNAVAILABLE";
    const status = error instanceof InsuranceConnectorError ? error.httpStatus : 503;
    return NextResponse.json({ error: code, message: "Statut OCR indisponible. Aucun traitement terminé ne peut être présumé." },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}
