import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

if (!/^postgres(ql)?:\/\/[^/]*(@localhost|@127\.0\.0\.1)(:|\/)/i.test(process.env.DATABASE_URL || "")) {
  throw new Error("ISOLATED_LOCAL_POSTGRES_REQUIRED");
}
const db = new PrismaClient();
const { assertSubscriptionSettlementAccount } = workflowTestLoader({})("@/lib/subscription-settlement");
const id = randomUUID().replace(/-/g, "");
const prefix = "qa-1041-" + id;
const create = (suffix, extra={})=>db.financialAccount.create({data:{
  id: prefix+"-"+suffix,
  name:"QA 1041 "+suffix+" "+id,
  accountType:"BANK",currency:"USD",status:"ACTIVE",...extra,
}});
let bank, cash, mmo, dormant, issue, legacy;
try {
  bank = await create("bank");
  cash = await create("cash",{accountType:"CASH"});
  mmo = await create("mmo",{accountType:"MOBILE_MONEY",currency:"CDF"});
  dormant = await create("dormant",{status:"INACTIVE"});
  issue = await create("issue",{reconciliationIssue:"QA_TEST_ONLY"});
  legacy = await create("legacy",{name:"Encaissements abonnements · BANK · "+id});

  const ok=await db.$transaction(tx=>assertSubscriptionSettlementAccount(tx,{
    accountId:bank.id,paymentMethod:"BANK_TRANSFER",currency:"USD",
  }));
  assert.equal(ok.id,bank.id);
  const validCard = await db.$transaction(tx=>assertSubscriptionSettlementAccount(tx,{
    accountId:bank.id,paymentMethod:"CARD",currency:"USD",
  }));
  assert.equal(validCard.id,bank.id);
  const validCash = await db.$transaction(tx=>assertSubscriptionSettlementAccount(tx,{
    accountId:cash.id,paymentMethod:"CASH",currency:"USD",
  }));
  assert.equal(validCash.id,cash.id);
  const validMmo = await db.$transaction(tx=>assertSubscriptionSettlementAccount(tx,{
    accountId:mmo.id,paymentMethod:"MOBILE_MONEY",currency:"CDF",
  }));
  assert.equal(validMmo.id,mmo.id);

  const rejected = [
    [{accountId:bank.id,paymentMethod:"MOBILE_MONEY",currency:"USD"},"ACCOUNT_MISMATCH"],
    [{accountId:bank.id,paymentMethod:"BANK_TRANSFER",currency:"CDF"},"ACCOUNT_MISMATCH"],
    [{accountId:bank.id,paymentMethod:"UNMAPPED_METHOD",currency:"USD"},"METHOD_UNSUPPORTED"],
    [{accountId:dormant.id,paymentMethod:"BANK_TRANSFER",currency:"USD"},"ACCOUNT_UNVERIFIED"],
    [{accountId:issue.id,paymentMethod:"BANK_TRANSFER",currency:"USD"},"ACCOUNT_UNVERIFIED"],
    [{accountId:legacy.id,paymentMethod:"BANK_TRANSFER",currency:"USD"},"ACCOUNT_UNVERIFIED"],
    [{accountId:prefix+"-missing",paymentMethod:"BANK_TRANSFER",currency:"USD"},"ACCOUNT_UNVERIFIED"],
    [{accountId:undefined,paymentMethod:"BANK_TRANSFER",currency:"USD"},"ACCOUNT_REQUIRED"],
  ];
  for(const [input,reason] of rejected){
    await assert.rejects(db.$transaction(tx=>assertSubscriptionSettlementAccount(tx,input)),
      err=>String(err?.message||"").includes("MANUAL_SETTLEMENT_"+reason),reason);
  }
  // Foreign-key: a nonexistent account cannot be linked to a manual settlement.
  const fkExists = await db.$queryRaw`
    SELECT 1 AS ok FROM information_schema.table_constraints
    WHERE table_name='ManualSubscriptionPayment'
      AND constraint_name='ManualSubscriptionPayment_settlementAccountId_fkey'
      AND constraint_type='FOREIGN KEY'`;
  assert.equal(fkExists.length,1,"DB must enforce the settlement FK");
  const column = await db.$queryRaw`
    SELECT is_nullable AS nullable FROM information_schema.columns
    WHERE table_name='ManualSubscriptionPayment' AND column_name='settlementAccountId'`;
  assert.equal(column[0]?.nullable,"YES","Historical requests must remain nullable");
  const verifiedColumn = await db.$queryRaw`
    SELECT is_nullable AS nullable FROM information_schema.columns
    WHERE table_name='ManualSubscriptionPayment' AND column_name='fundsVerifiedAt'`;
  assert.equal(verifiedColumn[0]?.nullable,"YES","Existing approvals must not be backfilled as verified");

  console.log("PASS #1041 PostgreSQL: account lock and policy, bank/cash/mobile USD/CDF, negative cases, nullable historical FK.");
} finally {
  await db.financialAccount.deleteMany({where:{id:{startsWith:prefix}}});
  await db.$disconnect();
}
