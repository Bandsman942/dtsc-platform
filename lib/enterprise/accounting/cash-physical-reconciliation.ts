import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { physicalCountRowsSchema,physicalCountTotal } from "@/lib/enterprise/accounting/physical-count";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

const physicalEvidenceSchema = z.object({ version: z.literal(1), accountRevision: z.number().int(), sessionDigest: z.string(), countedAt: z.string(), evidenceReference: z.string().min(3).max(200), physicalCount: z.string(), counts:physicalCountRowsSchema.optional(),currencyCode:z.string().optional(), attested: z.literal(true) });

export async function captureCashPhysicalSnapshotTx(tx: Prisma.TransactionClient, organizationId: string, financialAccountId: string, actorUserId?: string) {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE id = ${financialAccountId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: financialAccountId, organizationId, accountType: "CASH", status: "ACTIVE", archivedAt: null } });
  if (!account) throw new EnterpriseAccountingError("RECONCILIATION_ACCOUNT_INVALID", 409);
  if (actorUserId) {
    const scope = await retailFinanceReadSiteScope(organizationId, actorUserId, "CLOSE_CASH", tx);
    if (scope !== null && (!account.siteId || !scope.includes(account.siteId))) throw new EnterpriseAccountingError("RETAIL_SITE_ACCESS_DENIED", 403);
  }
  const sessions = await tx.enterpriseCashSession.findMany({ where: { organizationId, financialAccountId }, orderBy: { id: "asc" }, select: { id: true, revision: true, status: true, updatedAt: true, discrepancies: { orderBy: { id: "asc" }, select: { id: true, status: true, updatedAt: true } } } });
  if (sessions.some(s => s.status !== "CLOSED" || s.discrepancies.some(d => !["POSTED", "RESOLVED_COUNT_ERROR", "LEGACY_REVERSED", "REAL_REVERSED"].includes(d.status)))) throw new EnterpriseAccountingError("RECONCILIATION_CASH_SESSIONS_UNRESOLVED", 409);
  const sessionDigest = createHash("sha256").update(JSON.stringify(sessions)).digest("hex");
  return { account, sessionDigest };
}

export async function assertCashPhysicalEvidenceTx(tx: Prisma.TransactionClient, organizationId: string, session: { financialAccountId: string; physicalEvidenceJson: Prisma.JsonValue | null; bookBalance: Prisma.Decimal; statementBalance: Prisma.Decimal }, actorUserId?: string) {
  const parsed = physicalEvidenceSchema.safeParse(session.physicalEvidenceJson);
  if (!parsed.success) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
  const current = await captureCashPhysicalSnapshotTx(tx, organizationId, session.financialAccountId, actorUserId);
  if (current.account.revision !== parsed.data.accountRevision || current.sessionDigest !== parsed.data.sessionDigest || !current.account.operationalBalance.equals(session.bookBalance) || !session.statementBalance.equals(parsed.data.physicalCount)) throw new EnterpriseAccountingError("RECONCILIATION_CASH_SNAPSHOT_CHANGED",409);
  if(parsed.data.counts){
    try{if(parsed.data.currencyCode!==current.account.currencyCode||!session.statementBalance.equals(physicalCountTotal(parsed.data.counts)))throw Error();}
    catch{throw new EnterpriseAccountingError("RECONCILIATION_COUNT_ROWS_INVALID",409);}
  }
  if (!session.bookBalance.equals(session.statementBalance)) throw new EnterpriseAccountingError("RECONCILIATION_DIFFERENCE_UNRESOLVED",409);
}
