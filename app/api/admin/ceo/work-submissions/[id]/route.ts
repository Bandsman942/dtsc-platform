import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getWorkSubmissionReviewDetail } from "@/lib/work-prestation-review-detail";
import { getWorkActor, isWorkPrestationError } from "@/lib/work-prestations";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const access = await requireAdminBlockAccess("ceo");
  if (access.response) {
    await writeApiLog({ request: req, statusCode: access.response.status, startedAt });
    return access.response;
  }
  const session = access.session;
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const submission = await getWorkSubmissionReviewDetail(actor, id, "CEO");
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ submission });
  } catch (error) {
    const status = isWorkPrestationError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "ceo_work_submission_detail_failed", code: isWorkPrestationError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isWorkPrestationError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Chargement impossible." }, { status });
  }
}
