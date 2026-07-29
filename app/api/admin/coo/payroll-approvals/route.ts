import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getPayrollActor, getPayrollApprovalQueue, isPayrollWorkflowError } from "@/lib/payroll-workflow";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const access = await requireAdminBlockAccess("coo");
  if (access.response) return access.response;
  const session = access.session;
  if (!isDtscInternalSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await getPayrollActor(session.userId);
  if (!actor) return NextResponse.json({ error: "Employee required" }, { status: 403 });
  try {
    const payrolls = await getPayrollApprovalQueue(actor, "COO");
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ payrolls });
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Chargement impossible." }, { status });
  }
}
