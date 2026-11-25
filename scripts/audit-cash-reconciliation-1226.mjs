#!/usr/bin/env node
// Strictly read-only, one explicit tenant and bounded time window. Output contains
// aggregate counts only: no customer identities, raw references or amounts.
import { Prisma, PrismaClient } from "@prisma/client";
const args=process.argv.slice(2);
if(args.length!==6 || args[0]!=="--organization-id" || args[2]!=="--from-date" || args[4]!=="--to-date")throw new Error("Usage: node scripts/audit-cash-reconciliation-1226.mjs --organization-id ID --from-date YYYY-MM-DD --to-date YYYY-MM-DD");
const organizationId=args[1];
const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Invalid date");const at=new Date(value+"T00:00:00.000Z");if(!Number.isFinite(at.getTime())||at.getUTCFullYear()!==Number(value.slice(0,4))||at.getUTCMonth()+1!==Number(value.slice(5,7))||at.getUTCDate()!==Number(value.slice(8)))throw new Error("Invalid date");return at;};
const from=date(args[3]),to=date(args[5]);to.setUTCDate(to.getUTCDate()+1);
if(!organizationId.trim()||from>=to||to.getTime()-from.getTime()>92*86400000)throw new Error("Explicit organization and max 92 days required");
const range={gte:from,lt:to},LIMIT=2000;
const prisma=new PrismaClient();
try{
  const report=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const org=await tx.organization.findFirst({where:{id:organizationId,deletedAt:null},select:{id:true}});
    if(!org)throw new Error("Unknown client organization");
    const [discrepancies,sessions]=await Promise.all([
      tx.enterpriseCashDiscrepancy.findMany({where:{organizationId,createdAt:range},take:LIMIT+1,orderBy:{id:"asc"},select:{id:true,status:true,amount:true,journalEntryId:true,cashSession:{select:{financialAccountId:true,siteId:true,expectedClosingAmount:true,countedClosingAmount:true,financialAccount:{select:{ledgerAccountId:true,currencyCode:true,siteId:true}}}}}}),
      tx.enterpriseReconciliationSession.findMany({where:{organizationId,createdAt:range},take:LIMIT+1,orderBy:{id:"asc"},select:{id:true,status:true,bankStatementId:true,physicalEvidenceJson:true}})
    ]);
    if(discrepancies.length>LIMIT||sessions.length>LIMIT)throw new Error("Scope exceeds 2000 rows per entity; narrow the date range");
    const counts={cashDiscrepancies:discrepancies.length,reconciliationSessions:sessions.length,legacyApproved:0,countMismatch:0,siteMismatch:0,missingOrAmbiguousJournal:0,legacyDraftWithConfirmedMatches:0,completedWithoutEvidence:0};
    const entries=await tx.enterpriseJournalEntry.findMany({where:{organizationId,sourceEntityType:"EnterpriseCashDiscrepancy",sourceEntityId:{in:discrepancies.map(d=>d.id)},postingEvent:"CASH_VARIANCE_POSTED"},take:LIMIT*2+1,select:{id:true,sourceEntityId:true,status:true}});
    if(entries.length>LIMIT*2)throw new Error("Journal evidence exceeds bound");
    const groups=new Map();
    for(const entry of entries){const group=groups.get(entry.sourceEntityId)||[];group.push(entry);groups.set(entry.sourceEntityId,group);}
    for(const d of discrepancies){
      if(d.status==="APPROVED")counts.legacyApproved++;
      const c=d.cashSession;
      if(c.expectedClosingAmount==null||c.countedClosingAmount==null||!c.countedClosingAmount.minus(c.expectedClosingAmount).equals(d.amount))counts.countMismatch++;
      if(c.siteId&&c.financialAccount.siteId&&c.siteId!==c.financialAccount.siteId)counts.siteMismatch++;
      if(["APPROVED","POSTED","LEGACY_REVERSED","REAL_REVERSED"].includes(d.status)){const linked=groups.get(d.id)||[];if(linked.length!==1||(d.journalEntryId&&linked[0]?.id!==d.journalEntryId))counts.missingOrAmbiguousJournal++;}
    }
    const matches=await tx.enterpriseReconciliationMatch.groupBy({by:["reconciliationSessionId","status"],where:{organizationId,reconciliationSessionId:{in:sessions.map(s=>s.id)},status:{in:["CONFIRMED","RESERVED"]}},_count:{_all:true}});
    const confirmed=new Set(matches.filter(m=>m.status==="CONFIRMED").map(m=>m.reconciliationSessionId));
    for(const session of sessions){if(["DRAFT","IN_PROGRESS","PENDING_VALIDATION"].includes(session.status)&&confirmed.has(session.id))counts.legacyDraftWithConfirmedMatches++;if(session.status==="COMPLETED"&&(!session.bankStatementId&&!session.physicalEvidenceJson||session.bankStatementId&&!confirmed.has(session.id)))counts.completedWithoutEvidence++;}
    return counts;
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
  console.log(JSON.stringify({mode:"READ_ONLY_DRY_RUN",scope:{from:args[3],to:args[5]},counts:report,warning:"Indicators only; no correction authorized or performed."},null,2));
}finally{await prisma.$disconnect();}
