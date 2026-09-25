import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeEducationRequest, educationErrorResponse } from "@/lib/enterprise/education/http";
import { educationMutationSchema, getEducationCreateSchema } from "@/lib/enterprise/education/schemas";
import { mutateEducationResource } from "@/lib/enterprise/education/service";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const parsed = educationMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EDUCATION_INPUT_INVALID", req);

  const { resource, action, revision } = parsed.data;
  let data = parsed.data.data;
  if (action === "UPDATE") {
    const resourceSchema = getEducationCreateSchema(resource);
    const updateInput = resourceSchema.safeParse(data);
    if (!updateInput.success) return enterpriseValidationErrorResponse(updateInput.error, "EDUCATION_INPUT_INVALID", req);
    data = updateInput.data as Record<string, unknown>;
  }

  const privileged = action === "ARCHIVE" || action === "CLOSE";
  const auth = await authorizeEducationRequest(req, organizationId, resource, privileged ? "manage" : "write", { mutation: true, limit: 160 });
  if (!auth.ok) return auth.response;

  try {
    const outcome = await mutateEducationResource({ organizationId, userId: auth.session.userId, resource, id, action, revision, data });
    await writeAuditLog({
      userId: auth.session.userId,
      organizationId,
      action: `ENTERPRISE_EDUCATION_${resource}_${action}`,
      entity: `EnterpriseEducation${resource}`,
      entityId: id,
      request: req,
      metadata: { organizationId, resource, action, moduleCode: auth.moduleCode },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", action, resource, moduleCode: auth.moduleCode } });
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "education", action: "mutation_failed", resource } });
    return educationErrorResponse(error, "EDUCATION_MUTATION_FAILED", req);
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED", message: "L’archivage académique doit utiliser une transition explicite." }, { status: 405 });
}
