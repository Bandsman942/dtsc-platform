import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cents, inspectProviderSettlement } from "./lib/provider-settlement-preflight.mjs";

const payment={
  providerReference:"QA_FAKE_EXTERNAL_REF",paidAt:new Date("2026-01-01T00:00:00Z"),
  amount:"30.00",currency:"USD",invoice:{hrcfoTransactionId:"qa-income-a"},
};
const good={id:"qa-income-a",amount:"30.00",currency:"USD",
  account:{name:"QA_VERIFIED_ACCOUNT",currency:"USD",status:"ACTIVE",reconciliationIssue:null}};
assert.equal(cents("0.01"),1n);
assert.equal(cents("100000000000.00"),10000000000000n);
assert.throws(()=>cents("100.001"),/INVALID_MONEY_AMOUNT/);
assert.deepEqual(inspectProviderSettlement(payment,[good]),[],"Consistent local links, not proof of bank settlement");
assert.ok(inspectProviderSettlement(payment,[]).includes("MISSING_INCOME"));
assert.ok(inspectProviderSettlement(payment,[good,good]).includes("DUPLICATE_INCOME"));
assert.ok(inspectProviderSettlement(payment,[{...good,amount:"31.00"}]).includes("MISMATCHED_AMOUNT"));
assert.ok(inspectProviderSettlement(payment,[{...good,currency:"CDF"}]).includes("MISMATCHED_CURRENCY"));
assert.ok(inspectProviderSettlement(payment,[{...good,account:{...good.account,name:"Encaissements abonnements · MOBILE_MONEY · USD"}}]).includes("SYNTHETIC_ACCOUNT"));
assert.ok(inspectProviderSettlement(payment,[{...good,account:{...good.account,reconciliationIssue:"QA_ANOMALY"}}]).includes("UNVERIFIED_FINANCIAL_ACCOUNT"));
assert.ok(inspectProviderSettlement({...payment,providerReference:null,paidAt:null,invoice:null},[]).includes("PAYMENT_REFERENCE_MISSING"));
assert.ok(inspectProviderSettlement({...payment,providerReference:null,paidAt:null,invoice:null},[]).includes("INVOICE_MISSING"));
assert.ok(inspectProviderSettlement({...payment,invoice:{hrcfoTransactionId:"qa-other"}},[good]).includes("INVOICE_INCOME_LINK_MISMATCH"));

const runner=readFileSync("scripts/provider-settlement-preflight.mjs","utf8");
assert.match(runner,/organizationSubscriptionId:\{not:null\}/);
assert.match(runner,/where:\{\s*organizationId/);
assert.match(runner,/sourceType:"ORGANIZATION_SUBSCRIPTION_PAYMENT"/);
assert.match(runner,/READ_ONLY_PSP_SETTLEMENT_AUDIT/);
assert.match(runner,/bankSettlementVerified:false/);
assert.match(runner,/providerCallbackVerified:false/);
assert.match(runner,/accountingPostingVerified:false/);
assert.doesNotMatch(runner,/\.(create|update|delete|upsert|executeRaw)\(/,"The runner must not mutate DB");
assert.doesNotMatch(runner,/console\.log\([^\n]*(payment|providerReference|invoice|account\.name)/);
console.log("PASS PAY-4 read-only MaishaPay preflight: monetary integrity, gaps, privacy, no mutation.");
