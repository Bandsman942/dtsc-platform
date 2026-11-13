import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit");
  if (!auth.ok) return auth.response;
  const { candidates } = await listEnterpriseApprovalCandidates({ organizationId,
    requesterUserId: auth.session.userId, moduleCode: "RETAIL_POS" });
  const eligible = await Promise.all(candidates.filter((candidate) => !candidate.isRequester && !candidate.selfApprovalOverride).map(async (candidate) => {
    const [payments, receivables] = await Promise.all([
      resolveEnterpriseModuleCapabilities({ organizationId, userId: candidate.userId, moduleCode: "FINANCE_PAYMENTS" }),
      resolveEnterpriseModuleCapabilities({ organizationId, userId: candidate.userId, moduleCode: "FINANCE_RECEIVABLES" }),
    ]);
    return payments.canApprove && receivables.canApprove ? { userId: candidate.userId, name: candidate.name, positionTitle: candidate.positionTitle } : null;
  }));
  const result = eligible.filter((candidate) => candidate !== null);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
    metadata: { organizationId, domain: "retail-omnichannel-returns", action: "validators", count: result.length } });
  return NextResponse.json({ candidates: result });
}
