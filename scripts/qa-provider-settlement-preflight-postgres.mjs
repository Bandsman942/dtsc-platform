import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if(!/^postgres(ql)?:\/\/[^/]*(@localhost|@127\.0\.0\.1)(:|\/)/i.test(process.env.DATABASE_URL||"")){
  throw new Error("ISOLATED_LOCAL_POSTGRES_REQUIRED");
}
const prisma=new PrismaClient();
const id=randomUUID().replace(/-/g,"");
const uid="qa-psp-u-"+id,orgA="qa-psp-a-"+id,orgB="qa-psp-b-"+id;
const planId="qa-psp-plan-"+id,subA="qa-psp-sub-a-"+id,subB="qa-psp-sub-b-"+id;
const pA="qa-psp-payment-a-"+id,pB="qa-psp-payment-b-"+id,accId="qa-psp-account-"+id;
const incomeId="qa-psp-income-"+id,invoiceId="qa-psp-invoice-"+id;
const run=(org,extra=[])=>spawnSync(process.execPath,[
  "scripts/provider-settlement-preflight.mjs",
  "--organization-id="+org,"--max-scanned=50","--ack=READ_ONLY_PSP_SETTLEMENT_AUDIT",...extra,
],{cwd:process.cwd(),encoding:"utf8",env:process.env});
try {
  await prisma.user.create({data:{id:uid,name:"QA_SYNTHETIC_ACTOR",email:"qa-psp-"+id+"@example.invalid",passwordHash:"QA_ONLY"}});
  await prisma.organization.createMany({data:[
    {id:orgA,name:"QA_SYNTHETIC_A",status:"ACTIVE"},
    {id:orgB,name:"QA_SYNTHETIC_B",status:"ACTIVE"},
  ]});
  await prisma.billingPlan.create({data:{id:planId,name:"QA_SYNTHETIC_PLAN",slug:"qa-psp-"+id,
    description:"TEST_ONLY",priceUsd:"30.00",dailyMessageLimit:1,dailyTokenLimit:1}});
  await prisma.organizationSubscription.createMany({data:[
    {id:subA,organizationId:orgA,planId,status:"ACTIVE"},
    {id:subB,organizationId:orgB,planId,status:"ACTIVE"},
  ]});
  await prisma.payment.createMany({data:[
    {id:pA,userId:uid,organizationId:orgA,organizationSubscriptionId:subA,
      provider:"MAISHAPAY",reference:"qa-ref-a-"+id,providerReference:"qa-fake-psp-a",
      amount:"30.00",currency:"USD",status:"PAID",paidAt:new Date()},
    {id:pB,userId:uid,organizationId:orgB,organizationSubscriptionId:subB,
      provider:"MAISHAPAY",reference:"qa-ref-b-"+id,providerReference:"qa-fake-psp-b",
      amount:"30.00",currency:"USD",status:"PAID",paidAt:new Date()},
  ]});
  await prisma.financialAccount.create({data:{
    id:accId,name:"Encaissements abonnements · MOBILE_MONEY · USD · "+id,
    accountType:"MOBILE_MONEY",currency:"USD",status:"ACTIVE",
  }});
  await prisma.hrcfoExpense.create({data:{
    id:incomeId,title:"QA_SUBSCRIPTION_LEDGER",requesterName:"QA_TENANT_A",
    category:"IN",transactionCategory:"IN",transactionType:"SUBSCRIPTION",
    amount:"30.00",currency:"USD",accountId:accId,sourceType:"ORGANIZATION_SUBSCRIPTION_PAYMENT",
    sourceId:pA,status:"VALIDATED",createdById:uid,
  }});
  await prisma.invoice.create({data:{
    id:invoiceId,number:"qa-psp-inv-"+id,userId:uid,organizationId:orgA,
    organizationSubscriptionId:subA,paymentId:pA,
    category:"ORGANIZATION_SUBSCRIPTION",planName:"QA_PLAN",amount:"30.00",
    currency:"USD",status:"PAID",paidAt:new Date(),hrcfoTransactionId:incomeId,
  }});

  const a=run(orgA);assert.equal(a.status,0,"Scoped PSP audit must work");
  const parsedA=JSON.parse(a.stdout);
  assert.equal(parsedA.scanned,1);
  assert.equal(parsedA.issueCounts.SYNTHETIC_ACCOUNT,1);
  assert.equal(parsedA.issueCounts.MISSING_INCOME,0);
  assert.equal(parsedA.bankSettlementVerified,false);
  assert.equal(parsedA.providerCallbackVerified,false);
  assert.equal(parsedA.accountingPostingVerified,false);
  assert.equal(parsedA.nextOffset,1);
  assert.ok(!a.stdout.includes(orgA));
  assert.ok(!a.stdout.includes(pA));
  assert.ok(!a.stdout.includes(id));
  assert.ok(!a.stdout.includes("qa-fake-psp"));

  const b=run(orgB);assert.equal(b.status,0);
  const parsedB=JSON.parse(b.stdout);
  assert.equal(parsedB.scanned,1);
  assert.equal(parsedB.issueCounts.MISSING_INCOME,1);
  assert.equal(parsedB.issueCounts.SYNTHETIC_ACCOUNT,0);
  assert.equal(JSON.parse(run(orgA,["--offset=1"]).stdout).scanned,0);
  const forbidden=spawnSync(process.execPath,[
    "scripts/provider-settlement-preflight.mjs","--organization-id="+orgA,
  ],{cwd:process.cwd(),encoding:"utf8",env:process.env});
  assert.notEqual(forbidden.status,0,"Operator gate must be present");
  const unchanged=await prisma.hrcfoExpense.findUniqueOrThrow({where:{id:incomeId}});
  assert.equal(String(unchanged.amount),"30");
  console.log("PASS PAY-4 PostgreSQL: tenant boundaries, real legacy synthetic posting, missing posting, no mutation, no PII.");
} finally {
  await prisma.invoice.deleteMany({where:{id:invoiceId}});
  await prisma.hrcfoExpense.deleteMany({where:{id:incomeId}});
  await prisma.payment.deleteMany({where:{id:{in:[pA,pB]}}});
  await prisma.organizationSubscription.deleteMany({where:{id:{in:[subA,subB]}}});
  await prisma.billingPlan.deleteMany({where:{id:planId}});
  await prisma.financialAccount.deleteMany({where:{id:accId}});
  await prisma.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
  await prisma.user.deleteMany({where:{id:uid}});
  await prisma.$disconnect();
}
