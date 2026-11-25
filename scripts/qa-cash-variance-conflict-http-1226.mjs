import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require=createRequire(import.meta.url);
const file="app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/variance-review/route.ts";
const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let failure;
const exports={};
const bindings={
  "next/server":{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
  "zod":require("zod"),
  "@/lib/auth/step-up":{hasRecentStepUp:async()=>true},
  "@/lib/audit":{writeAuditLog:async()=>{},writeApiLog:async()=>{}},
  "@/lib/enterprise/accounting/http":{
    authorizeFinanceRequest:async()=>({ok:true,session:{userId:"reviewer"}}),
    financeErrorResponse:()=>({status:500,body:{error:"CASH_VARIANCE_REVIEW_FAILED"}}),
    financeValidationErrorResponse:()=>({status:400}),
  },
  "@/lib/enterprise/accounting/access":{getEnterpriseAccountingAccess:async()=>({})},
  "@/lib/enterprise/accounting/cash-variance-review-service":{reviewCashVariance:async()=>{throw failure;}},
  "@/lib/enterprise/accounting/cash-variance-canonical-service":{},
  "@/lib/prisma":{},
  "@/lib/enterprise/retail/site-access":{},
};
vm.runInNewContext(code,{exports,Date,require:id=>{assert.ok(id in bindings,id);return bindings[id];}},{filename:file});
for(const [error,status] of [
  [{code:"P2034"},409],
  [{code:"P2010",meta:{code:"40001"}},409],
  [{code:"P2010",meta:{code:"40P01"}},409],
  [{code:"P2010",meta:{code:"23505"}},500],
  [{code:"P2010",message:"could not serialize access"},500],
  [{code:"UNKNOWN",meta:{code:"40001"}},500],
  [new Error("unexpected deadlock text from another dependency"),500],
]){
  failure=error;
  const result=await exports.POST({json:async()=>({discrepancyId:"variance",revision:1,decision:"LINK_CANONICAL",canonicalTreasuryTransactionId:"movement",verifiedCount:"105",evidenceReference:"PV-TEST",reason:"Independently verified synthetic evidence",attest:true})},{params:Promise.resolve({organizationId:"test-org",sessionId:"test-session"})});
  assert.equal(result.status,status,JSON.stringify(error));
  if(status===409)assert.equal(result.body.error,"CASH_VARIANCE_REVIEW_CONFLICT");
}
console.log("#1226 HTTP conflict classification: 3 known conflicts map to 409; 4 unexpected failures stay errors");
