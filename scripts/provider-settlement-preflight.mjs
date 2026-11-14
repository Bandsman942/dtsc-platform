#!/usr/bin/env node
/**
 * #1170 PAY-4: readonly DTSC provider settlement preflight.
 * No auto-created account, billing mutation, callback processing or posting.
 * No user, payment, invoice, provider reference or account name in output.
 */
import { PrismaClient } from "@prisma/client";
import { inspectProviderSettlement, PROVIDER_PREFLIGHT_CODES } from "./lib/provider-settlement-preflight.mjs";
const MAX_SCAN=10000, BATCH_SIZE=100;
function parseOptions(args) {
  const accepted=new Set(["organization-id","offset","max-scanned","ack"]);
  const o=new Map();
  for(const arg of args){
    if(!arg.startsWith("--"))throw new Error("INVALID_ARGUMENT");
    const [k,...v]=arg.slice(2).split("=");
    if(!accepted.has(k)||o.has(k)||!v.length)throw new Error("INVALID_ARGUMENT");
    o.set(k,v.join("="));
  }
  const organizationId=o.get("organization-id");
  if(!organizationId||!/^[a-zA-Z0-9_-]{3,100}$/.test(organizationId))throw new Error("ORGANIZATION_REQUIRED");
  if(o.get("ack")!=="READ_ONLY_PSP_SETTLEMENT_AUDIT")throw new Error("OPERATOR_ACK_REQUIRED");
  const maxScanned=Number(o.get("max-scanned")||"500");
  const offset=Number(o.get("offset")||"0");
  if(!Number.isSafeInteger(maxScanned)||maxScanned<1||maxScanned>MAX_SCAN)throw new Error("INVALID_SCAN_LIMIT");
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000000)throw new Error("INVALID_OFFSET");
  return {organizationId,maxScanned,offset};
}

async function main() {
  const {organizationId,maxScanned,offset}=parseOptions(process.argv.slice(2));
  const prisma=new PrismaClient();
  const report={scanned:0,flaggedPayments:0,issueCounts:Object.fromEntries(PROVIDER_PREFLIGHT_CODES.map(k=>[k,0]))};
  let cursor;
  try {
    while(report.scanned<maxScanned) {
      const take=Math.min(BATCH_SIZE,maxScanned-report.scanned);
      const payments=await prisma.payment.findMany({
        where:{
          organizationId,
          organizationSubscriptionId:{not:null},
          status:"PAID",
          provider:"MAISHAPAY",
          ...(cursor?{id:{gt:cursor}}:{}),
        },
        select:{
          id:true,providerReference:true,paidAt:true,amount:true,currency:true,
          invoice:{select:{id:true,hrcfoTransactionId:true}},
        },
        orderBy:{id:"asc"},
        ...(cursor?{}:{skip:offset}),
        take,
      });
      if(!payments.length)break;
      const byId=new Map(payments.map(p=>[p.id,[]]));
      const transactions=await prisma.hrcfoExpense.findMany({
        where:{sourceType:"ORGANIZATION_SUBSCRIPTION_PAYMENT",sourceId:{in:payments.map(p=>p.id)}},
        select:{
          id:true,sourceId:true,currency:true,amount:true,
          account:{select:{name:true,currency:true,status:true,reconciliationIssue:true}},
        },
      });
      for(const item of transactions)if(byId.has(item.sourceId))byId.get(item.sourceId).push(item);
      for(const payment of payments){
        cursor=payment.id;
        report.scanned++;
        const findings=inspectProviderSettlement(payment,byId.get(payment.id)||[]);
        if(findings.length)report.flaggedPayments++;
        for(const code of findings)report.issueCounts[code]++;
      }
      if(payments.length<take)break;
    }
    console.log(JSON.stringify({
      mode:"READ_ONLY",
      scanned:report.scanned,
      flaggedPayments:report.flaggedPayments,
      issueCounts:report.issueCounts,
      nextOffset:offset+report.scanned,
      scanLimitReached:report.scanned>=maxScanned,
      bankSettlementVerified:false,
      providerCallbackVerified:false,
      accountingPostingVerified:false,
      note:"Classifies historical ledger links only; no PSP reconciliation or bank settlement is proven.",
    }));
  } finally {await prisma.$disconnect();}
}
try{await main();}
catch(err) {
  // No query context, stack trace or payment identifiers in logs.
  console.error("PROVIDER_SETTLEMENT_PREFLIGHT_FAILED",err?.code??err?.name??"ERROR");
  process.exitCode=1;
}
