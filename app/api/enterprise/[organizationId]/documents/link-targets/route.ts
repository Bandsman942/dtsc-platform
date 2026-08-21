import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

const LINK_TARGET_TYPES = [
  "EnterpriseContract",
  "EnterpriseTask",
  "EnterpriseRequest",
  "EnterpriseApproval",
  "EnterpriseMeeting",
  "EnterpriseSupplier",
  "EnterprisePurchase",
  "EnterpriseProject",
  "EnterpriseAsset",
] as const;

type LinkTargetType = (typeof LINK_TARGET_TYPES)[number];
type LinkTargetChoice = {
  id: string;
  reference?: string | null;
  title?: string | null;
  status?: string | null;
  date?: string | null;
  relatedEntityType?: string | null;
};

function isLinkTargetType(value: string): value is LinkTargetType {
  return (LINK_TARGET_TYPES as readonly string[]).includes(value);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = new URL(req.url).searchParams.get("type") || "";
  if (!isLinkTargetType(type)) return NextResponse.json({ error: "Invalid target type" }, { status: 400 });

  let targets: LinkTargetChoice[] = [];

  if (type === "EnterpriseContract") {
    const rows = await prisma.enterpriseContract.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, reference: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    targets = rows;
  } else if (type === "EnterpriseProject") {
    const rows = await prisma.enterpriseProject.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, reference: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    targets = rows.map((row) => ({ id: row.id, reference: row.reference, title: row.name, status: row.status }));
  } else if (type === "EnterpriseAsset") {
    const rows = await prisma.enterpriseAsset.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    targets = rows.map((row) => ({ id: row.id, reference: row.code, title: row.name, status: row.status }));
  } else if (type === "EnterpriseTask") {
    const rows = await prisma.enterpriseTask.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    targets = rows;
  } else if (type === "EnterpriseRequest") {
    const rows = await prisma.enterpriseRequest.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    targets = rows;
  } else if (type === "EnterpriseApproval") {
    const rows = await prisma.enterpriseApproval.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, targetEntityType: true, status: true, requestedAt: true },
      orderBy: { requestedAt: "desc" },
      take: 300,
    });
    targets = rows.map((row) => ({ id: row.id, status: row.status, date: row.requestedAt.toISOString(), relatedEntityType: row.targetEntityType }));
  } else if (type === "EnterpriseMeeting") {
    const rows = await prisma.enterpriseMeeting.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, title: true, status: true, startAt: true },
      orderBy: { startAt: "desc" },
      take: 300,
    });
    targets = rows.map((row) => ({ id: row.id, title: row.title, status: row.status, date: row.startAt.toISOString() }));
  } else if (type === "EnterpriseSupplier") {
    const rows = await prisma.enterpriseSupplier.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, legalName: true, displayName: true, status: true },
      orderBy: { legalName: "asc" },
      take: 300,
    });
    targets = rows.map((row) => ({ id: row.id, title: row.displayName || row.legalName, status: row.status }));
  } else {
    const rows = await prisma.enterprisePurchase.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, reference: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    targets = rows;
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "documents-link-targets", targetType: type, count: targets.length },
  });
  return NextResponse.json({ targets });
}
