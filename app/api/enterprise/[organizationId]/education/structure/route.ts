import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { EDUCATION_MODULE_CODES, EDUCATION_RESOURCE_CODES, type EducationModuleCode, type EducationResourceCode } from "@/lib/enterprise/education/constants";
import { authorizeEducationRequest, educationErrorResponse, educationListParams } from "@/lib/enterprise/education/http";
import { educationCreateEnvelopeSchema, getEducationCreateSchema } from "@/lib/enterprise/education/schemas";
import { createEducationResource, getEducationWorkspaceSnapshot, listEducationResource, saveEducationSettings } from "@/lib/enterprise/education/service";

type Params = { params: Promise<{ organizationId: string }> };

function parseResource(value: string | null): EducationResourceCode | null {
  const normalized = value?.trim().toUpperCase() || "";
  return EDUCATION_RESOURCE_CODES.includes(normalized as EducationResourceCode) ? normalized as EducationResourceCode : null;
}

function parseModule(value: string | null): EducationModuleCode {
  const normalized = value?.trim().toUpperCase() || "ACADEMIC_STRUCTURE";
  return EDUCATION_MODULE_CODES.includes(normalized as EducationModuleCode) ? normalized as EducationModuleCode : "ACADEMIC_STRUCTURE";
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const url = new URL(req.url);
  const resource = parseResource(url.searchParams.get("resource"));

  if (!resource) {
    const moduleCode = parseModule(url.searchParams.get("moduleCode"));
    const auth = await authorizeEducationRequest(req, organizationId, moduleCode, "read");
    if (!auth.ok) return auth.response;
    const snapshot = await getEducationWorkspaceSnapshot(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", action: "snapshot", moduleCode } });
    return NextResponse.json({ snapshot, capabilities: { canWrite: auth.access.canWrite, canManage: auth.access.canAdminister } });
  }

  const auth = await authorizeEducationRequest(req, organizationId, resource, "read");
  if (!auth.ok) return auth.response;
  const result = await listEducationResource(organizationId, resource, educationListParams(req));
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", action: "list", resource, moduleCode: auth.moduleCode } });
  return NextResponse.json({ resource, ...result, capabilities: { canWrite: auth.access.canWrite, canManage: auth.access.canAdminister } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const envelope = educationCreateEnvelopeSchema.safeParse(await req.json().catch(() => null));
  if (!envelope.success) return enterpriseValidationErrorResponse(envelope.error, "EDUCATION_INPUT_INVALID", req);

  const resource = envelope.data.resource;
  const schema = getEducationCreateSchema(resource);
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);

  const auth = await authorizeEducationRequest(req, organizationId, resource, resource === "SETTINGS" ? "manage" : "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;

  try {
    const item = resource === "SETTINGS"
      ? await saveEducationSettings(organizationId, auth.session.userId, parsed.data)
      : await createEducationResource(organizationId, auth.session.userId, resource, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      organizationId,
      action: `ENTERPRISE_EDUCATION_${resource}_CREATED_OR_UPDATED`,
      entity: `EnterpriseEducation${resource}`,
      entityId: "id" in item && typeof item.id === "string" ? item.id : null,
      request: req,
      metadata: { organizationId, resource, moduleCode: auth.moduleCode },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", action: "create", resource, moduleCode: auth.moduleCode } });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    await writeApiLog({ request: req, statusCode: error instanceof Error ? 409 : 500, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", action: "create_failed", resource } });
    return educationErrorResponse(error, "EDUCATION_CREATE_FAILED", req);
  }
}
