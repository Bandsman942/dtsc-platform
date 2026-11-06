import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { archiveEnterpriseEmploymentContract, updateEnterpriseEmploymentContract } from "@/lib/enterprise/hr-payroll/contracts";
import { employmentContractUpdateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; contractId: string }> };
const archiveSchema = z.object({ revision: z.coerce.number().int().positive(), reason: z.string().trim().min(3).max(500) });

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-employment-contract-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId, contractId } = await params;
  const access = await getEnterpriseCommonDomainAccess({
    session,
    organizationId,
    moduleCode: "HUMAN_RESOURCES",
    action: "write",
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = employmentContractUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYMENT_CONTRACT_UPDATE_INPUT_INVALID", req);

  try {
    const contract = await updateEnterpriseEmploymentContract(organizationId, contractId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_EMPLOYMENT_CONTRACT_UPDATED_RESUBMITTED",
      entity: "EnterpriseEmploymentContract",
      entityId: contract.id,
      request: req,
      metadata: { organizationId },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, domain: "employment-contracts", action: "update" },
    });
    return NextResponse.json({ ok: true, contract });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "EMPLOYMENT_CONTRACT_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, contractId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-contract-archive:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = archiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYMENT_CONTRACT_ARCHIVE_INPUT_INVALID", req);
  try {
    const contract = await archiveEnterpriseEmploymentContract(organizationId, contractId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYMENT_CONTRACT_ARCHIVED", entity: "EnterpriseEmploymentContract", entityId: contract.id, request: req, metadata: { organizationId, archive: true } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employment-contract-archive" } });
    return NextResponse.json({ ok: true, contract: { id: contract.id, status: contract.status, revision: contract.revision, archivedAt: contract.archivedAt } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "EMPLOYMENT_CONTRACT_ARCHIVE_FAILED", req);
  }
}
