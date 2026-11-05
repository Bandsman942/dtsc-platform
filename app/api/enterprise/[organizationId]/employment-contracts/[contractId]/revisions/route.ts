import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; contractId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, contractId } = await params;
  // Immutable snapshots include remuneration and contractual clauses.
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contract = await prisma.enterpriseEmploymentContract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, reference: true, versionNumber: true, revision: true, supersedesContractId: true },
  });
  if (!contract) return NextResponse.json({ error: "EMPLOYMENT_CONTRACT_NOT_FOUND" }, { status: 404 });
  const url = new URL(req.url);
  const page = Math.min(10000, Math.max(1, Number(url.searchParams.get("page")) || 1));
  const pageSize = Math.min(25, Math.max(1, Number(url.searchParams.get("pageSize")) || 10));
  const where = { organizationId, contractId: contract.id };
  const [items, total] = await Promise.all([
    prisma.enterpriseEmploymentContractRevision.findMany({
      where, orderBy: { revisionNumber: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, revisionNumber: true, snapshotJson: true, savedAt: true },
    }),
    prisma.enterpriseEmploymentContractRevision.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt,
    metadata: { organizationId, domain: "employment-contract-revisions", page } });
  return NextResponse.json({
    contract, items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
