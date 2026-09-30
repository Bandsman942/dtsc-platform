import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { educationAdmissionActionSchema } from "@/lib/enterprise/education/admissions-schemas";
import { actOnAdmission } from "@/lib/enterprise/education/admissions-service";
import { authorizeEducationRequest, educationErrorResponse } from "@/lib/enterprise/education/http";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const parsed = educationAdmissionActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);
  const permissionAction = parsed.data.action === "DECIDE" ? "approve" : "write";
  const auth = await authorizeEducationRequest(req, organizationId, "ADMISSIONS", permissionAction, { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  try {
    const outcome = await actOnAdmission(organizationId, auth.session.userId, id, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: `EDUCATION_ADMISSION_${parsed.data.action}`, entity: "EnterpriseEducationAdmissionApplication", entityId: id, request: req, metadata: { organizationId, moduleCode: "ADMISSIONS", action: parsed.data.action } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "ADMISSIONS", action: parsed.data.action } });
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "ADMISSIONS", action: "transition_failed" } });
    return educationErrorResponse(error, "EDUCATION_ADMISSION_ACTION_FAILED", req);
  }
}
