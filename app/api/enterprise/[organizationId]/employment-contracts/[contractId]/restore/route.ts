import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { restoreEnterpriseEmploymentContract } from "@/lib/enterprise/hr-payroll/contracts";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; contractId: string }> };
const restoreSchema = z.object({ revision: z.coerce.number().int().positive() });

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, contractId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-contract-restore:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = restoreSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYMENT_CONTRACT_RESTORE_INPUT_INVALID", req);
  try {
    const contract = await restoreEnterpriseEmploymentContract(organizationId, contractId, session.userId, parsed.data.revision);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYMENT_CONTRACT_RESTORED", entity: "EnterpriseEmploymentContract", entityId: contract.id, request: req, metadata: { organizationId, restored: true } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employment-contract-restore" } });
    return NextResponse.json({ ok: true, contract: { id: contract.id, status: contract.status, revision: contract.revision, archivedAt: contract.archivedAt } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "EMPLOYMENT_CONTRACT_RESTORE_FAILED", req);
  }
}
