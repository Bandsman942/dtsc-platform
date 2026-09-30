import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { educationStudentUpdateSchema } from "@/lib/enterprise/education/admissions-schemas";
import { updateStudent } from "@/lib/enterprise/education/admissions-service";
import { authorizeEducationRequest, educationErrorResponse } from "@/lib/enterprise/education/http";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const parsed = educationStudentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);
  const auth = await authorizeEducationRequest(req, organizationId, "STUDENTS", "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  try {
    const item = await updateStudent(organizationId, auth.session.userId, id, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: "EDUCATION_STUDENT_UPDATED", entity: "EnterpriseEducationStudent", entityId: id, request: req, metadata: { organizationId, moduleCode: "STUDENTS" } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "STUDENTS", action: "update" } });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode: "STUDENTS", action: "update_failed" } });
    return educationErrorResponse(error, "EDUCATION_STUDENT_UPDATE_FAILED", req);
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED", message: "Un étudiant avec historique académique ne peut pas être supprimé physiquement." }, { status: 405 });
}
