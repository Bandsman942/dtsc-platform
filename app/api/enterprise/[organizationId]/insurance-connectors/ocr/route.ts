import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { HIRMS_ENVIRONMENTS } from "@/lib/enterprise/health-insurance-connectors/environments";
import { InsuranceConnectorError } from "@/lib/enterprise/health-insurance-connectors/registry";
import { HIRMS_OCR_PROXY_MAX_BYTES } from "@/lib/enterprise/health-insurance-connectors/hirms-ocr";
import { uploadHirmsOcrForTenant, listHirmsOcrJobs } from "@/lib/enterprise/health-insurance-connectors/ocr-service";

export const runtime = "nodejs";
type Params = { params: Promise<{ organizationId: string }> };
async function allowed(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, organizationId: string, mutate: boolean) {
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) return false;
  const org = await prisma.organization.findFirst({
    where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null, sectorCode: { in: ["HEALTH_CARE","PHARMACY"] } },
    select: { sectorCode: true },
  });
  if (!org) return false;
  if (org.sectorCode === "HEALTH_CARE") {
    const access = await getHealthInsuranceAccess({ session, organizationId, action: mutate ? "write" : "read" });
    return Boolean(access && (mutate ? access.canSubmit : access.canViewReports));
  }
  return canAccessPharmacySales(session.userId, organizationId, mutate ? "confirm" : "view");
}
export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await allowed(session, organizationId, false))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const env = z.enum(HIRMS_ENVIRONMENTS).safeParse(url.searchParams.get("environment") || "UAT");
  if (!env.success) return NextResponse.json({ error: "HIRMS_ENVIRONMENT_INVALID" }, { status: 400 });
  return NextResponse.json(await listHirmsOcrJobs(organizationId, env.data, Number(url.searchParams.get("page") || "1")), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await allowed(session, organizationId, true))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = await rateLimit(getRateLimitKey(req, `hirms-ocr:${organizationId}:${session.userId}`), 8, 3600000, { failureMode: "closed" });
  if (!limit.ok) return NextResponse.json({ error: "HIRMS_OCR_RATE_LIMITED" }, { status: 429 });
  if (Number(req.headers.get("content-length") || 0) > HIRMS_OCR_PROXY_MAX_BYTES + 200000)
    return NextResponse.json({ error: "HIRMS_OCR_PROXY_FILE_TOO_LARGE" }, { status: 413 });
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
    return NextResponse.json({ error: "HIRMS_OCR_MULTIPART_REQUIRED" }, { status: 415 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "HIRMS_OCR_FORM_INVALID" }, { status: 400 });
  const env = z.enum(HIRMS_ENVIRONMENTS).safeParse(form.get("environment"));
  const date = z.string().max(10).safeParse(form.get("invoiceDate"));
  const invoice = z.string().cuid().optional().safeParse(form.get("salesInvoiceId") || undefined);
  const file = form.get("file");
  if (!env.success || !date.success || !invoice.success || !(file instanceof File))
    return NextResponse.json({ error: "HIRMS_OCR_FORM_INVALID" }, { status: 400 });
  try {
    const result = await uploadHirmsOcrForTenant(organizationId, session.userId, env.data, file, date.data, invoice.data);
    await writeAuditLog({ userId: session.userId, action: "HIRMS_OCR_DOCUMENT_SUBMITTED", entity: "EnterpriseHealthInsuranceOcrJob", request: req, metadata: { organizationId, environment: env.data, ocrJobId: result.id, status: result.transportStatus } });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof InsuranceConnectorError ? error.code : "HIRMS_OCR_OPERATION_FAILED";
    const status = error instanceof InsuranceConnectorError ? error.httpStatus : 503;
    return NextResponse.json({ error: code, message: "Transfert refusé ou état de transmission incertain. Consultez l'historique avant de réessayer." },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}
