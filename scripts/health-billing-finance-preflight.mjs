#!/usr/bin/env node
/**
 * P0 #1167: READ ONLY, per-tenant audit of Healthcare invoice/payment balance.
 * NEVER certifies ERP Finance posting; NEVER logs PHI, record IDs or references.
 */
import { PrismaClient } from "@prisma/client";
import { auditMedicalBillingRow, MEDICAL_BILLING_AUDIT_CODES } from "./lib/health-billing-finance-preflight.mjs";

function options(args) {
  const allowed = new Set(["organization-id","max-scanned","offset","ack"]);
  const values = new Map();
  for (const arg of args) {
    if (!arg.startsWith("--")) throw new Error("INVALID_ARGUMENT");
    const [key,...v] = arg.slice(2).split("=");
    if (!allowed.has(key) || values.has(key) || v.length === 0) throw new Error("INVALID_ARGUMENT");
    values.set(key,v.join("="));
  }
  const id = values.get("organization-id");
  if (!id || !/^[a-zA-Z0-9_-]{3,100}$/.test(id)) throw new Error("ORGANIZATION_REQUIRED");
  if (values.get("ack") !== "READ_ONLY_HEALTH_BILLING_AUDIT") throw new Error("OPERATOR_ACK_REQUIRED");
  const maxScanned = Number(values.get("max-scanned") ?? "500");
  const offset = Number(values.get("offset") ?? "0");
  if (!Number.isSafeInteger(maxScanned) || maxScanned < 1 || maxScanned > 10000) throw new Error("INVALID_SCAN_LIMIT");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000) throw new Error("INVALID_OFFSET");
  return { organizationId:id,maxScanned,offset };
}

async function main() {
  const {organizationId,maxScanned,offset}=options(process.argv.slice(2));
  const prisma = new PrismaClient();
  const totals = {scanned:0,flaggedInvoices:0,confirmedPayments:0,issueCounts:Object.fromEntries(MEDICAL_BILLING_AUDIT_CODES.map(x=>[x,0]))};
  let cursor;
  try {
    while (totals.scanned < maxScanned) {
      const take = Math.min(100,maxScanned-totals.scanned);
      const rows = await prisma.healthMedicalInvoice.findMany({
        where:{organizationId,...(cursor?{id:{gt:cursor}}:{})},
        select:{
          id:true,status:true,patientAmount:true,paidAmount:true,balanceAmount:true,totalAmount:true,insuranceAmount:true,
          payments:{select:{amount:true,status:true,paymentReference:true}},
        },
        orderBy:{id:"asc"},
        ...(cursor?{}:{skip:offset}),
        take,
      });
      if (rows.length===0) break;
      for (const row of rows) {
        cursor=row.id;
        totals.scanned++;
        totals.confirmedPayments+=row.payments.filter(x=>x.status==="CONFIRMED").length;
        const issues=auditMedicalBillingRow(row);
        if (issues.length) totals.flaggedInvoices++;
        for(const code of issues) totals.issueCounts[code]++;
      }
      if (rows.length<take)break;
    }
    console.log(JSON.stringify({
      mode:"READ_ONLY",scanned:totals.scanned,flaggedInvoices:totals.flaggedInvoices,
      confirmedPayments:totals.confirmedPayments,issueCounts:totals.issueCounts,
      nextOffset:offset+totals.scanned,scanLimitReached:totals.scanned>=maxScanned,
      financePostingVerified:false,providerReconciliationVerified:false,
      note:"The report counts local HEALTH invariants only. No ERP ledger, bank, insurer or PSP payment is certified.",
    }));
  } finally {
    await prisma.$disconnect();
  }
}

try {await main();}
catch(err) {
  // Never print Prisma query details, SQL params, patient data or stack.
  console.error("HEALTH_FINANCE_PREFLIGHT_FAILED",err?.code??err?.name??"ERROR");
  process.exitCode=1;
}
