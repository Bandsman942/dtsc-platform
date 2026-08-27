import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

const MODULE_CODE = /^[A-Z0-9_]{2,120}$/;
type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const moduleCode = new URL(req.url).searchParams.get("moduleCode")?.trim() || "";
  if (!MODULE_CODE.test(moduleCode)) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Module invalide." }, { status: 400 });

  const access = await resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "submit" });
  if (!access.allowed) return NextResponse.json({ error: "FORBIDDEN", message: access.message }, { status: 403 });

  const result = await listEnterpriseApprovalCandidates({ organizationId, requesterUserId: session.userId, moduleCode });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode, approvalCandidates: result.candidates.length } });
  return NextResponse.json(result);
}
