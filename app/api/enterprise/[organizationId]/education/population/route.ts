import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { educationAdmissionCreateSchema, educationGuardianCreateSchema } from "@/lib/enterprise/education/admissions-schemas";
import {
  createAdmission,
  createGuardian,
  getEducationPopulationSnapshot,
  listAdmissions,
  listGuardians,
  listStudents,
} from "@/lib/enterprise/education/admissions-service";
import { authorizeEducationRequest, educationErrorResponse, educationListParams } from "@/lib/enterprise/education/http";
import type { EducationModuleCode } from "@/lib/enterprise/education/constants";

type Params = { params: Promise<{ organizationId: string }> };

function moduleFrom(req: Request): EducationModuleCode | null {
  const moduleCode = new URL(req.url).searchParams.get("moduleCode")?.trim().toUpperCase();
  return moduleCode === "ADMISSIONS" || moduleCode === "STUDENTS" || moduleCode === "GUARDIANS"
    ? moduleCode
    : null;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const moduleCode = moduleFrom(req);
  if (!moduleCode) return NextResponse.json({ error: "EDUCATION_MODULE_INVALID", message: "Module Education invalide." }, { status: 400 });
  const auth = await authorizeEducationRequest(req, organizationId, moduleCode, "read");
  if (!auth.ok) return auth.response;

  try {
    const input = educationListParams(req);
    const [snapshot, result] = await Promise.all([
      getEducationPopulationSnapshot(organizationId),
      moduleCode === "ADMISSIONS"
        ? listAdmissions(organizationId, input)
        : moduleCode === "STUDENTS"
          ? listStudents(organizationId, input)
          : listGuardians(organizationId, input),
    ]);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode, action: "list" } });
    return NextResponse.json({
      moduleCode,
      snapshot,
      ...result,
      capabilities: {
        canWrite: auth.access.canWrite,
        canApprove: auth.access.canApprove,
        canManage: auth.access.canAdminister,
      },
    });
  } catch (error) {
    await writeApiLog({ request: req, statusCode: 500, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode, action: "list_failed" } });
    return educationErrorResponse(error, "EDUCATION_POPULATION_LOAD_FAILED", req);
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const moduleCode = moduleFrom(req);
  if (!moduleCode || moduleCode === "STUDENTS") {
    return NextResponse.json({ error: "METHOD_NOT_ALLOWED", message: "Cette création n’est pas disponible sur ce module." }, { status: 405 });
  }
  const auth = await authorizeEducationRequest(req, organizationId, moduleCode, "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);

  try {
    if (moduleCode === "ADMISSIONS") {
      const parsed = educationAdmissionCreateSchema.safeParse(body);
      if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);
      const item = await createAdmission(organizationId, auth.session.userId, parsed.data);
      await writeAuditLog({ userId: auth.session.userId, organizationId, action: "EDUCATION_ADMISSION_CREATED", entity: "EnterpriseEducationAdmissionApplication", entityId: item.id, request: req, metadata: { organizationId, moduleCode } });
      await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode, action: "create" } });
      return NextResponse.json({ ok: true, item }, { status: 201 });
    }

    const parsed = educationGuardianCreateSchema.safeParse(body);
    if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);
    const item = await createGuardian(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: "EDUCATION_GUARDIAN_CREATED", entity: "EnterpriseEducationGuardian", entityId: item.id, request: req, metadata: { organizationId, moduleCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode, action: "create" } });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", moduleCode, action: "create_failed" } });
    return educationErrorResponse(error, "EDUCATION_POPULATION_CREATE_FAILED", req);
  }
}
