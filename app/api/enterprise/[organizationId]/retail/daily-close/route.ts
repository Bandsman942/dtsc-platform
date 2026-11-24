import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailDailyCloseCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createRetailDailyClose } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, search, status, from, to } = retailListParams(req);
  const endOfDay = to ? new Date(to.getTime() + 86_400_000 - 1) : null;
  const siteId = new URL(req.url).searchParams.get("siteId")?.trim() || null;
  const closeScope = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "CLOSE_CASH");
  const where: Prisma.EnterpriseRetailDailyCloseWhereInput = { organizationId,
    ...(siteId ? { siteId: closeScope !== null && !closeScope.includes(siteId) ? { in: [] } : siteId }
      : closeScope !== null ? { siteId: { in: closeScope } } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { notes: { contains: search, mode: "insensitive" } }] } : {}),
    ...(from || endOfDay ? { businessDate: { ...(from ? { gte: from } : {}), ...(endOfDay ? { lte: endOfDay } : {}) } } : {}) };
  if (new URL(req.url).searchParams.get("export") === "1") {
    // Single bounded snapshot of the same server-authorized filters, never the visible page.
    const snapshot = await prisma.$transaction(async (tx) => {
      const lines = await tx.enterpriseRetailDailyCloseLine.findMany({
        where:{organizationId,dailyClose:where},
        orderBy:[{dailyClose:{businessDate:"desc"}},{dailyCloseId:"asc"},{id:"asc"}],
        take:1001,
        select:{id:true,financialAccountId:true,accountType:true,currencyCode:true,cashSessionId:true,systemClosingBalance:true,declaredBalance:true,differenceAmount:true,varianceReason:true,dailyClose:{select:{number:true,businessDate:true,siteId:true,status:true}}},
      });
      if(lines.length>1000)return null;
      const siteIds=[...new Set(lines.flatMap(line=>line.dailyClose.siteId?[line.dailyClose.siteId]:[]))];
      const accountIds=[...new Set(lines.map(line=>line.financialAccountId))];
      const [sites,accounts]=await Promise.all([
        tx.enterpriseSite.findMany({where:{organizationId,id:{in:siteIds}},select:{id:true,name:true,code:true}}),
        tx.enterpriseFinancialAccount.findMany({where:{organizationId,id:{in:accountIds}},select:{id:true,name:true,code:true}}),
      ]);
      const siteMap=new Map(sites.map(site=>[site.id,site.code+" · "+site.name]));
      const accountMap=new Map(accounts.map(account=>[account.id,account.code+" · "+account.name]));
      return lines.map(line=>({id:line.id,number:line.dailyClose.number,businessDate:line.dailyClose.businessDate.toISOString(),site:line.dailyClose.siteId?siteMap.get(line.dailyClose.siteId)||null:null,status:line.dailyClose.status,account:accountMap.get(line.financialAccountId)||null,accountType:line.accountType,currencyCode:line.currencyCode,cashSessionId:line.cashSessionId,systemClosingBalance:line.systemClosingBalance.toFixed(),declaredBalance:line.declaredBalance.toFixed(),differenceAmount:line.differenceAmount.toFixed(),varianceReason:line.varianceReason}));
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    if(!snapshot)return NextResponse.json({error:"RETAIL_CLOSE_EXPORT_LIMIT",message:"Affinez les filtres : 1 000 lignes maximum par export."},{status:422});
    await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"retail-daily-close-export",rowCount:snapshot.length}});
    return NextResponse.json({rows:snapshot},{headers:{"Cache-Control":"private, no-store"}});
  }
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseRetailDailyClose.findMany({ where, orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { lines: true } }),
    prisma.enterpriseRetailDailyClose.count({ where }),
  ]);
  const cashSessionIds = [...new Set(rawItems.flatMap((item) => item.lines.map((line) => line.cashSessionId).filter((id): id is string => Boolean(id))))];
  const [cashSessions, cashApprovals] = cashSessionIds.length ? await Promise.all([
    prisma.enterpriseCashSession.findMany({ where: { organizationId, id: { in: cashSessionIds } }, select: { id: true, status: true } }),
    prisma.enterpriseApproval.findMany({
      where: { organizationId, targetEntityType: "EnterpriseCashSession", targetEntityId: { in: cashSessionIds }, status: "PENDING", archivedAt: null },
      select: { targetEntityId: true, approverUserId: true },
    }),
  ]) : [[], []];
  const cashStatusById = new Map(cashSessions.map((session) => [session.id, session.status]));
  const cashApproverById = new Map(cashApprovals.map((approval) => [approval.targetEntityId, approval.approverUserId]));
  const items = rawItems.map((item) => {
    const linkedCashSessionIds = item.lines.map((line) => line.cashSessionId).filter((id): id is string => Boolean(id));
    const canManage = auth.access.canManage && item.status === "SUBMITTED";
    const canApprove = canManage && linkedCashSessionIds.every((sessionId) => {
      const status = cashStatusById.get(sessionId);
      return status === "CLOSED" || (status === "PENDING_VALIDATION" && cashApproverById.get(sessionId) === auth.session.userId);
    });
    const canReject = canManage && linkedCashSessionIds.every((sessionId) => {
      const status = cashStatusById.get(sessionId);
      return status === "REJECTED" || (status === "PENDING_VALIDATION" && cashApproverById.get(sessionId) === auth.session.userId);
    });
    return { ...item, capabilities: { canApprove, canReject } };
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-daily-close", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = retailDailyCloseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Clôture invalide." }, { status: 400 });
  try {
    const result = await createRetailDailyClose(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_DAILY_CLOSE_SUBMITTED", entity: "EnterpriseRetailDailyClose", entityId: result.close.id, request: req, metadata: { organizationId, number: result.close.number, businessDate: result.close.businessDate.toISOString(), lineCount: result.close.lines.length, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-daily-close", action: "submit" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_DAILY_CLOSE_CREATE_FAILED");
  }
}
