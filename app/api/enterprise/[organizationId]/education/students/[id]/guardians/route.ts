import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { educationStudentGuardianLinkSchema } from "@/lib/enterprise/education/admissions-schemas";
import { linkGuardianToStudent } from "@/lib/enterprise/education/admissions-service";
import { authorizeEducationRequest, educationErrorResponse } from "@/lib/enterprise/education/http";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const parsed = educationStudentGuardianLinkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);
  const auth = await authorizeEducationRequest(req, organizationId, "GUARDIANS", "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  try {
    const relation = await linkGuardianToStudent(organizationId, auth.session.userId, id, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: "EDUCATION_STUDENT_GUARDIAN_LINKED", entity: "EnterpriseEducationStudentGuardian", entityId: relation.id, request: req, metadata: { organizationId, studentId: id, guardianId: parsed.data.guardianId } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "GUARDIANS", action: "link_student" } });
    return NextResponse.json({ ok: true, relation });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "GUARDIANS", action: "link_student_failed" } });
    return educationErrorResponse(error, "EDUCATION_GUARDIAN_LINK_FAILED", req);
  }
}
