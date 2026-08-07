import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { openCashSession } from "@/lib/enterprise/accounting/treasury-service";
import { cashSessionOpenSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

const CASH_CAPABLE_MODULES: RetailModuleCode[] = ["RETAIL_DAILY_CLOSE", "RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"];

async function authorizeRetailCashRequest(req: Request, organizationId: string, action: EnterpriseModuleAction, mutation = false) {
  let lastDenied: Awaited<ReturnType<typeof authorizeRetailRequest>> | null = null;
  for (const moduleCode of CASH_CAPABLE_MODULES) {
    const auth = await authorizeRetailRequest(req, organizationId, moduleCode, action, mutation ? { mutation: true, limit: 30 } : undefined);
    if (auth.ok) return { ...auth, moduleCode };
    lastDenied = auth;
  }
  return lastDenied as NonNullable<typeof lastDenied>;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailCashRequest(req, organizationId, "read");
  if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseCashSession.findMany({
    where: { organizationId, cashierUserId: auth.session.userId, status: { in: ["OPEN", "PENDING_VALIDATION", "CLOSED", "REJECTED"] } },
    orderBy: { openedAt: "desc" },
    take: 30,
    include: { financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } }, _count: { select: { movements: true, counts: true, discrepancies: true } } },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-cash-sessions", moduleCode: auth.moduleCode } });
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailCashRequest(req, organizationId, "submit", true);
  if (!auth.ok) return auth.response;
  const parsed = cashSessionOpenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ouverture de caisse invalide." }, { status: 400 });
  try {
    const session = await openCashSession(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_CASH_SESSION_OPENED", entity: "EnterpriseCashSession", entityId: session.id, request: req, metadata: { organizationId, financialAccountId: session.financialAccountId, openingAmount: session.openingAmount.toFixed(), moduleCode: auth.moduleCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-cash-sessions", action: "open", moduleCode: auth.moduleCode } });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CASH_SESSION_OPEN_FAILED");
  }
}
