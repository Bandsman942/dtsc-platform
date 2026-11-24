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
