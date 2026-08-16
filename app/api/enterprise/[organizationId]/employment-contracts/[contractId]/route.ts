import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { updateEnterpriseEmploymentContract } from "@/lib/enterprise/hr-payroll/contracts";
import { employmentContractUpdateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; contractId: string }> };

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
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", message: parsed.error.issues[0]?.message || "Contrat invalide." },
      { status: 400 },
    );
  }

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
