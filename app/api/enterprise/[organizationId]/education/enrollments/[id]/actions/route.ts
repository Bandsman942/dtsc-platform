import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { educationEnrollmentActionSchema } from "@/lib/enterprise/education/admissions-schemas";
import { actOnEnrollment } from "@/lib/enterprise/education/admissions-service";
import { authorizeEducationRequest, educationErrorResponse } from "@/lib/enterprise/education/http";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const parsed = educationEnrollmentActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);
  const auth = await authorizeEducationRequest(req, organizationId, "STUDENTS", "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  try {
    const enrollment = await actOnEnrollment(organizationId, auth.session.userId, id, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: `EDUCATION_ENROLLMENT_${parsed.data.action}`, entity: "EnterpriseEducationEnrollment", entityId: id, request: req, metadata: { organizationId, action: parsed.data.action } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "STUDENTS", action: parsed.data.action } });
    return NextResponse.json({ ok: true, enrollment });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "STUDENTS", action: "enrollment_transition_failed" } });
    return educationErrorResponse(error, "EDUCATION_ENROLLMENT_ACTION_FAILED", req);
  }
}
