import assert from "node:assert/strict";
import fs from "node:fs";
import { journalEntryCapabilities } from "../lib/enterprise/accounting/journal-entry-capabilities.ts";
const entry = {status:"POSTED",preparedByUserId:"a",approvedByUserId:"b",postedByUserId:"c"};
const access={canSubmit:true,canApprove:true,canManage:true};
for(const actorUserId of ["a","b","c"]) assert.equal(journalEntryCapabilities({entry,access,actorUserId,assigned:false}).canReverse,false);
assert.equal(journalEntryCapabilities({entry,access,actorUserId:"d",assigned:false}).canReverse,true);
assert.equal(journalEntryCapabilities({entry,access:{...access,canManage:false},actorUserId:"d",assigned:false}).canReverse,false);
const read=p=>fs.readFileSync(p,"utf8");
const detail=read("app/api/enterprise/[organizationId]/accounting-query/route.ts");
assert.match(detail,/journalEntryCapabilities\(/);
const ui=read("components/enterprise/professional/retail-daily-close-workspace.tsx");
assert.match(ui,/expectedCloseAmount: Number\(session.expectedCurrentAmount\)/);
assert.match(ui,/declaredBalance - account.expectedCloseAmount/);
assert.doesNotMatch(ui,/expectedAmount=\{Number\(account.operationalBalance\)\}/);
assert.match(ui,/cashSessionId: account.closeSession.id/);
const service=read("lib/enterprise/retail/service.ts");
assert.match(service,/line.expectedSessionAmount !== undefined/);
const builder=read("lib/enterprise/accounting/core-posting-builders.ts").split("export const buildCashVariancePosting:")[1].split("export const buildDepreciationPosting:")[0];
assert.match(builder,/sessionSite !== accountSite/);
assert.equal((builder.match(/, siteId, description: discrepancy.reason/g)||[]).length,2);
console.log("#1226 tranche A guards: PASS");

const retailClose=read("lib/enterprise/retail/service.ts").split("export async function decideRetailDailyClose(")[1].split("export async function getRetailDashboard(")[0];
const cashClose=read("lib/enterprise/accounting/accounting-operations-approval-orchestration.ts").split("export async function validateCashSessionAssignedApproval(")[1].split("async function reconciliationSnapshot")[0];
for(const code of [retailClose,cashClose]) { assert.match(code,/PENDING_QUALIFICATION/); assert.doesNotMatch(code,/postBusinessEvent\(/); }
console.log("#1226 tranche B1 guards: PASS");

const treasury=read("lib/enterprise/accounting/treasury-service.ts");
assert.match(treasury,/bankStatementId: session.bankStatementId/);
assert.match(treasury,/lineTotal.equals\(lineAmount\)/);
assert.match(treasury,/transactionTotal.equals\(transaction.amount\)/);
assert.match(treasury,/RECONCILIATION_AMOUNT_EXCEEDS_TRANSACTION/);
assert.match(treasury,/assertReconciliationEvidenceTx\(tx, organizationId, session, actorUserId\)/);
const evidence=read("lib/enterprise/accounting/reconciliation-evidence.ts");
assert.match(evidence,/lines.some\(line=>line.reconciliationStatus!=="UNMATCHED"/);
assert.match(evidence,/transactions.some\(transaction=>transaction.reconciliationStatus!=="UNRECONCILED"/);
const { maskFinancialReference }=await import("../lib/enterprise/accounting/masked-financial-reference.ts");
assert.equal(maskFinancialReference("+123456789"),"•••• 6789");
assert.equal(maskFinancialReference("•••• 6789"),"•••• 6789");
console.log("#1226 tranche B2 guards: PASS");

const { suggestExactReconciliationMatches } = await import("../lib/enterprise/accounting/reconciliation-exact-suggestions.ts");
const dt = new Date("2026-11-24T08:00:00Z");
const dayFormatter = new Intl.DateTimeFormat("en-CA",{timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit"});
const days = {statement:date=>dayFormatter.format(date),transaction:date=>dayFormatter.format(date)};
const line = {id:"l1",reference:"REF-1",transactionDate:dt,currencyCode:"CDF",debit:"0",credit:"100.10",reconciliationStatus:"UNMATCHED"};
const transaction = {id:"t1",reference:"REF-1",transactionDate:dt,currencyCode:"CDF",direction:"INBOUND",amount:"100.100000"};
assert.equal(suggestExactReconciliationMatches([line],[transaction],days).length,1);
for(const mismatch of [{currencyCode:"USD"},{direction:"OUTBOUND"},{amount:"100.11"},{reference:null},{transactionDate:new Date("2026-11-25T08:00:00Z")}]) assert.equal(suggestExactReconciliationMatches([line],[{...transaction,...mismatch}],days).length,0);
assert.equal(suggestExactReconciliationMatches([line],[transaction,{...transaction,id:"t2"}],days).length,0);
assert.equal(suggestExactReconciliationMatches([line,{...line,id:"l2"}],[transaction],days).length,0);
assert.equal(suggestExactReconciliationMatches([{...line,reconciliationStatus:"MATCHED"}],[transaction],days).length,0);
assert.match(treasury,/RECONCILIATION_AMOUNT_EXCEEDS_BANK_LINE/);
console.log("#1226 tranche C1 exact suggestions: PASS");

const varianceReview=read("lib/enterprise/accounting/cash-variance-review-service.ts");
for(const marker of ["CASH_VARIANCE_REVIEW_FORBIDDEN","CASH_VARIANCE_CORRECTED_COUNT_MISMATCH","CASH_VARIANCE_LEGACY_PROOF_REQUIRED","CASH_VARIANCE_REVIEWED","reverseJournalEntryTx","postBusinessEventTx","Prisma.TransactionIsolationLevel.Serializable","RESOLVED_COUNT_ERROR","LEGACY_REVERSED"]) assert.ok(varianceReview.includes(marker),marker);
assert.match(varianceReview,/verifiedCount.equals\(session.expectedClosingAmount\)/);
assert.match(varianceReview,/originalEntries.length !== 1/);
assert.match(varianceReview,/cashVarianceQualification:true/);
assert.match(read("lib/enterprise/accounting/posting-service.ts"),/CASH_VARIANCE_QUALIFICATION_REQUIRED/);
assert.match(read("lib/enterprise/accounting/reversal-service.ts"),/CASH_VARIANCE_REVIEW_REQUIRED/);
const varianceRoute=read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/variance-review/route.ts");
for(const marker of ["hasRecentStepUp","getEnterpriseAccountingAccess","authorizeFinanceRequest","writeAuditLog","writeApiLog"]) assert.ok(varianceRoute.includes(marker),marker);
console.log("#1226 tranche C2 review guards: PASS");

assert.match(treasury,/existingPair.matchedAmount.equals/);
assert.match(treasury,/row.reconciliationSessionId!==session.id/);
assert.match(evidence,/lineTotals.get\(line.id\)\?\.equals/);
assert.match(evidence,/transactionTotals.get\(transaction.id\)\?\.equals/);
console.log("#1226 tranche D1 partial allocation guards: PASS");

const {bankStatementBalanceIssues}=await import("../lib/enterprise/accounting/bank-statement-balance-validation.ts");
const statement={periodStart:dt,periodEnd:dt,openingBalance:"100.10",closingBalance:"102.10",lines:[{transactionDate:dt,debit:"0",credit:"2.00",description:"Receipt",reference:"ref",runningBalance:"102.10"}]};
assert.deepEqual(bankStatementBalanceIssues(statement),[]);
assert.ok(bankStatementBalanceIssues({...statement,closingBalance:"102.11"}).some(issue=>issue.code==="BANK_STATEMENT_CLOSING_BALANCE_MISMATCH"));
assert.ok(bankStatementBalanceIssues({...statement,lines:[{...statement.lines[0],debit:"1"}]}).some(issue=>issue.code==="BANK_STATEMENT_LINE_DIRECTION_INVALID"));
assert.ok(bankStatementBalanceIssues({...statement,lines:[{...statement.lines[0],runningBalance:"102.11"}]}).some(issue=>issue.code==="BANK_STATEMENT_RUNNING_BALANCE_MISMATCH"));
assert.ok(bankStatementBalanceIssues({...statement,lines:[...statement.lines,...statement.lines]}).some(issue=>issue.code==="BANK_STATEMENT_DUPLICATE_LINE"));
console.log("#1226 tranche D2 statement balance guards: PASS");

const physical=read("lib/enterprise/accounting/cash-physical-reconciliation.ts");
for (const marker of ["RECONCILIATION_CASH_SESSIONS_UNRESOLVED","RECONCILIATION_CASH_SNAPSHOT_CHANGED","sessionDigest","FOR UPDATE","retailFinanceReadSiteScope"]) assert.ok(physical.includes(marker),marker);
assert.match(evidence,/assertCashPhysicalEvidenceTx/);
console.log("#1226 tranche E1 physical cash guards: PASS");

const dated=read("lib/enterprise/accounting/reconciliation-dated-balance.ts");
for(const marker of ["civilMidnightUtc","followingCivilDate","RECONCILIATION_BOOK_BALANCE_UNVERIFIED","RECONCILIATION_HISTORICAL_REVERSAL_REVIEW_REQUIRED","operationalBalance"]) assert.ok(dated.includes(marker),marker);
assert.match(evidence,/datedReconciliationBalanceTx/);
console.log("#1226 tranche E2 dated balance guards: PASS");

assert.match(treasury,/status: "RESERVED"/);
assert.match(treasury,/cancelReconciliationReservation/);
assert.match(evidence,/finalizeReconciliationEvidenceTx/);
assert.match(evidence,/paymentTotals.get\(payment.id\)\?\.equals/);
console.log("#1226 tranche F reservation lifecycle guards: PASS");

assert.match(varianceReview,/CASH_VARIANCE_REVERSAL/);
assert.match(varianceReview,/nextStatus="REAL_REVERSED"/);
const audit1226=read("scripts/audit-cash-reconciliation-1226.mjs");
assert.match(audit1226,/SET TRANSACTION READ ONLY/);
assert.match(audit1226,/LIMIT=2000/);
console.log("#1226 tranche G inverse and dry-run guards: PASS");

assert.match(treasury,/CASH_OPENING_FUNDS_RESERVED/);
assert.match(treasury,/remaining=account.operationalBalance.minus\(reserved\)/);
assert.match(service,/cashSession.revision !== line.cashSessionRevision/);
assert.match(ui,/cashSessionRevision: account.closeSession.revision/);
console.log("#1226 tranche H cash custody guards: PASS");

const handover=read("lib/enterprise/accounting/cash-handover-service.ts");
assert.match(handover,/source.cashierUserId===target.cashierUserId/);
assert.match(handover,/sourceBalance.lessThan\(amount\)/);
assert.match(handover,/movementType:"CUSTODY_HANDOVER",direction:"OUTBOUND"/);
assert.match(handover,/movementType:"CUSTODY_HANDOVER",direction:"INBOUND"/);
assert.doesNotMatch(handover,/enterpriseFinancialAccount.update|enterpriseJournalEntry.create|enterpriseTreasuryTransaction.create/);
assert.match(service,/assertNoPendingCashHandoverTx/);
console.log("#1226 tranche I custody handover guards: PASS");

assert.match(treasury,/cashierUserId, status: \{ in: \["OPEN", "CLOSING"\] \}/);
const closeSummary=read("app/api/enterprise/[organizationId]/retail/daily-close/summary/route.ts");
assert.match(closeSummary,/SELECT DISTINCT s.id/);
assert.match(closeSummary,/CUSTODY_HANDOVER/);
assert.doesNotMatch(closeSummary,/SUM\(l."declaredBalance"\)/);
console.log("#1226 tranche J consolidated cash flow guards: PASS");

assert.equal(maskFinancialReference("1234"),"••••");
assert.equal(maskFinancialReference("AB-12"),"••••");
assert.equal(maskFinancialReference("123456789"),"•••• 6789");
assert.equal(maskFinancialReference("•••• 6789"),"•••• 6789");
assert.equal(maskFinancialReference("••••"),"••••");
assert.equal(maskFinancialReference(null),null);
const closeExport=read("app/api/enterprise/[organizationId]/retail/daily-close/route.ts");
for(const marker of ["dailyClose:where","RepeatableRead","take:1001","RETAIL_CLOSE_EXPORT_LIMIT"])assert.ok(closeExport.includes(marker),marker);
for(const marker of ["downloadProfessionalCsv","downloadProfessionalXlsx","downloadProfessionalPdf","exportFilteredCloses"])assert.ok(ui.includes(marker)||read("components/enterprise/professional/retail-daily-close-workspace.tsx").includes(marker),marker);
console.log("#1226 filtered closure export and reference masking: PASS");

const {bankStatementOverlapWhere}=await import("../lib/enterprise/accounting/bank-statement-balance-validation.ts");
assert.deepEqual(bankStatementOverlapWhere("tenant",{financialAccountId:"bank",periodStart:dt,periodEnd:dt}),{organizationId:"tenant",financialAccountId:"bank",periodStart:{lte:dt},periodEnd:{gte:dt}});
assert.deepEqual(bankStatementOverlapWhere("tenant",{financialAccountId:"bank",periodStart:dt,periodEnd:dt},"resume").id,{not:"resume"});
for(const source of [treasury,read("lib/enterprise/bulk-jobs/queue.ts"),read("lib/enterprise/bulk-jobs/worker.ts")])assert.match(source,/bankStatementOverlapWhere\(/);
console.log("#1226 cross-statement period overlap guard: PASS");

const accountListRoute=read("app/api/enterprise/[organizationId]/financial-accounts/route.ts");
const treasuryLookupRoute=read("app/api/enterprise/[organizationId]/treasury-lookups/route.ts");
for (const source of [accountListRoute,treasuryLookupRoute]) {
  assert.doesNotMatch(source,/maskedReference:\s*\{\s*contains:/);
  assert.match(source,/maskedReference:\s*maskFinancialReference\(/);
}
console.log("#1226 private account reference list and lookup guards: PASS");
