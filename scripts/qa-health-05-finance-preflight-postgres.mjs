import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (!/^postgres(ql)?:\/\/[^/]*(@localhost|@127\.0\.0\.1)(:|\/)/i.test(process.env.DATABASE_URL || "")) {
  throw new Error("ISOLATED_LOCAL_POSTGRES_REQUIRED");
}
const db=new PrismaClient();
const token=randomUUID().replace(/-/g,"");
const userId="qa-hfin-user-"+token,orgA="qa-hfin-org-a-"+token,orgB="qa-hfin-org-b-"+token;
const patientA="qa-hfin-pat-a-"+token,patientB="qa-hfin-pat-b-"+token;
const invoiceA="qa-hfin-inv-a-"+token,invoiceB="qa-hfin-inv-b-"+token;
const run=(orgId,extra=[])=>spawnSync(process.execPath,[
  "scripts/health-billing-finance-preflight.mjs",
  "--organization-id="+orgId,"--max-scanned=25","--ack=READ_ONLY_HEALTH_BILLING_AUDIT",...extra,
],{encoding:"utf8",cwd:process.cwd(),env:process.env});
try {
  await db.user.create({data:{id:userId,name:"FICTIONAL_OPERATOR",email:"hfin-"+token+"@example.invalid",passwordHash:"TEST_ONLY"}});
  await db.organization.createMany({data:[
    {id:orgA,name:"FICTIONAL_HEALTH_A",status:"ACTIVE"},
    {id:orgB,name:"FICTIONAL_HEALTH_B",status:"ACTIVE"},
  ]});
  const patient=(id,organizationId)=>({
    id,organizationId,patientNumber:"TEST"+token,
    fullName:"FICTIONAL_NO_PHI",sex:"OTHER",phonePrimary:"000000000",
    address:"FICTIONAL_ADDRESS",emergencyContactName:"FICTIONAL_CONTACT",
    emergencyContactPhone:"000000000",createdById:userId,
  });
  await db.healthPatient.createMany({data:[patient(patientA,orgA),patient(patientB,orgB)]});
  await db.healthMedicalInvoice.createMany({data:[
    {id:invoiceA,organizationId:orgA,invoiceNumber:"QA-HFIN-A-"+token,patientId:patientA,
      invoiceType:"STANDARD",currency:"CDF",status:"PARTIAL_PAID",
      totalAmount:"130.00",insuranceAmount:"30.00",patientAmount:"100.00",
      paidAmount:"60.00",balanceAmount:"40.00",createdById:userId},
    {id:invoiceB,organizationId:orgB,invoiceNumber:"QA-HFIN-B-"+token,patientId:patientB,
      invoiceType:"STANDARD",currency:"CDF",status:"PAID",
      totalAmount:"90.00",insuranceAmount:"0.00",patientAmount:"90.00",
      paidAmount:"90.00",balanceAmount:"0.00",createdById:userId},
  ]});
  await db.healthMedicalInvoicePayment.createMany({data:[
    {organizationId:orgA,invoiceId:invoiceA,amount:"60.00",paymentMethod:"CASH",
      paymentReference:"FICTIONAL_REF_A",receiptNumber:"QA-REC-A-"+token,collectedById:userId,status:"CONFIRMED"},
    {organizationId:orgB,invoiceId:invoiceB,amount:"10.00",paymentMethod:"CASH",
      paymentReference:"FICTIONAL_REF_B",receiptNumber:"QA-REC-B-"+token,collectedById:userId,status:"CONFIRMED"},
  ]});
  const resultA=run(orgA);
  assert.equal(resultA.status,0,"Tenant A audit must succeed");
  const dataA=JSON.parse(resultA.stdout);
  assert.equal(dataA.mode,"READ_ONLY");
  assert.equal(dataA.scanned,1);
  assert.equal(dataA.flaggedInvoices,0,"Correct tenant A invoice must pass");
  assert.equal(dataA.financePostingVerified,false,"Never claim an ERP ledger posting");
  assert.equal(dataA.providerReconciliationVerified,false);
  assert.equal(dataA.nextOffset,1);
  assert.equal(dataA.confirmedPayments,1);
  assert.ok(!resultA.stdout.includes("FICTIONAL_NO_PHI"));
  assert.ok(!resultA.stdout.includes("FICTIONAL_REF_A"));
  assert.ok(!resultA.stdout.includes(invoiceA));
  const resultB=run(orgB);
  assert.equal(resultB.status,0,"Tenant B audit must succeed");
  const dataB=JSON.parse(resultB.stdout);
  assert.equal(dataB.scanned,1,"Other tenant must be isolated");
  assert.equal(dataB.flaggedInvoices,1,"Mismatched tenant B invoice must flag");
  assert.equal(dataB.issueCounts.CONFIRMED_PAYMENT_SUM_MISMATCH,1);
  const page=run(orgA,["--offset=1"]);
  assert.equal(page.status,0);
  assert.equal(JSON.parse(page.stdout).scanned,0,"Paging must avoid first invoice replay");
  const unapproved=spawnSync(process.execPath,["scripts/health-billing-finance-preflight.mjs",
    "--organization-id="+orgA],{encoding:"utf8",env:process.env,cwd:process.cwd()});
  assert.notEqual(unapproved.status,0,"Operator attestation required");
  const unchanged=await db.healthMedicalInvoice.findUniqueOrThrow({where:{id:invoiceB}});
  assert.equal(String(unchanged.paidAmount),"90","Audit cannot reconcile or rewrite payments");
  console.log("PASS HEALTH-05 PostgreSQL: readonly multi-tenant evidence, mismatches, privacy, authorization, pagination.");
} finally {
  await db.healthMedicalInvoicePayment.deleteMany({where:{organizationId:{in:[orgA,orgB]}}});
  await db.healthMedicalInvoice.deleteMany({where:{id:{in:[invoiceA,invoiceB]}}});
  await db.healthPatient.deleteMany({where:{id:{in:[patientA,patientB]}}});
  await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
  await db.user.deleteMany({where:{id:userId}});
  await db.$disconnect();
}
