import {expect,test} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import ExcelJS from "exceljs";

// This scenario writes synthetic fixtures only in the isolated #662 CI job.
if(process.env.CI!=="true" || !/^postgresql:\/\/[^@]+@localhost:5432\/dtsc_hotfix_662_acceptance(?:\?|$)/.test(process.env.DATABASE_URL||"")) throw new Error("Financial #1226 E2E requires disposable CI PostgreSQL");
const prisma=new PrismaClient();
const organizationId=process.env.E2E_ORGANIZATION_ID||"e2e-erp-professional-org";
const base=process.env.E2E_BASE_URL||"http://127.0.0.1:3000";
if(new URL(base).hostname!=="127.0.0.1")throw new Error("Financial #1226 E2E requires local application");
const root="/api/enterprise/"+organizationId;
const path="/enterprise-modules/FINANCE_CASH";
let owner,recipient,ledger,site;
async function signIn(browser,email,password){
  const context=await browser.newContext({baseURL:base,viewport:{width:390,height:844}});
  const response=await context.request.post(base+"/api/auth/sign-in",{data:{email,password,organizationId,next:path},headers:{origin:base,referer:base+"/auth/sign-in"}});
  expect(response.ok(),await response.text()).toBeTruthy();
  return context;
}
async function call(context,method,url,data){
  const response=await context.request.fetch(base+url,{method,headers:{origin:base,referer:base+path},...(data===undefined?{}:{data})});
  return {response,body:await response.json().catch(()=>null)};
}
async function ok(context,method,url,data){
  const result=await call(context,method,url,data);
  expect(result.response.ok(),JSON.stringify(result.body)).toBeTruthy();
  return result.body;
}
async function stepUp(context,password){
  await ok(context,"POST","/api/auth/step-up",{password});
}
async function account(type,opening,balance){
  const id=randomUUID().slice(0,8);
  return prisma.enterpriseFinancialAccount.create({data:{organizationId,code:"H1226-"+id,name:"Synthetic #1226 "+id,accountType:type,currencyCode:"USD",openingBalance:opening,operationalBalance:balance,ledgerAccountId:ledger.id,siteId:site.id,status:"ACTIVE"}});
}
async function contextPair(browser){
  const a=await signIn(browser,process.env.E2E_ADMIN_EMAIL,process.env.E2E_ADMIN_PASSWORD);
  const b=await signIn(browser,process.env.E2E_USER_EMAIL,process.env.E2E_USER_PASSWORD);
  return [a,b];
}
test.describe.serial("Hotfix #1226 financial integrity (isolated browser and PostgreSQL)",()=>{
  test.beforeAll(async()=>{
    owner=await prisma.user.findUniqueOrThrow({where:{email:process.env.E2E_ADMIN_EMAIL}});
    recipient=await prisma.user.findUniqueOrThrow({where:{email:process.env.E2E_USER_EMAIL}});
    await prisma.organizationMember.upsert({where:{organizationId_userId:{organizationId,userId:recipient.id}},update:{role:"ADMIN_ENTERPRISE",status:"ACTIVE",removedAt:null},create:{organizationId,userId:recipient.id,role:"ADMIN_ENTERPRISE",status:"ACTIVE",joinedAt:new Date()}});
    ledger=await prisma.enterpriseLedgerAccount.findFirstOrThrow({where:{organizationId,code:"SHOP2-CASH"}});
    site=await prisma.enterpriseSite.findFirstOrThrow({where:{organizationId,code:"SHOP2-E2E-SITE"}});
    for(const [index,moduleCode] of ["FINANCE_CASH","FINANCE_BANK","FINANCE_RECONCILIATION","FINANCE_ACCOUNTING","FINANCE_TREASURY","FINANCE_OVERVIEW","VALIDATIONS"].entries()){
      await prisma.enterpriseModule.upsert({where:{organizationId_moduleCode:{organizationId,moduleCode}},update:{isEnabled:true},create:{organizationId,moduleCode,labelFr:moduleCode,labelEn:moduleCode,moduleCategory:"E2E_1226",isEnabled:true,isCore:false,requiresPlanLevel:"BUSINESS",sortOrder:12260+index}});
    }
  });
  test.afterAll(async()=>{await prisma.$disconnect();});
  test("two cashiers cannot reuse opening funds; handover is independent and cash close does not post unexplained income",async({browser})=>{
    const [a,b]=await contextPair(browser);
    try{
      const cash=await account("CASH",100,100);
      const source=(await ok(a,"POST",root+"/cash-sessions",{financialAccountId:cash.id,openingAmount:"70"})).session;
      const rejected=await call(b,"POST",root+"/cash-sessions",{financialAccountId:cash.id,openingAmount:"40"});
      expect(rejected.response.status(),JSON.stringify(rejected.body)).toBe(409);
      expect(rejected.body.error).toBe("CASH_OPENING_FUNDS_RESERVED");
      const target=(await ok(b,"POST",root+"/cash-sessions",{financialAccountId:cash.id,openingAmount:"30"})).session;
      const endpoint=root+"/cash-sessions/"+source.id+"/handover";
      const proposal={action:"PROPOSE",targetSessionId:target.id,amount:"20",reason:"Physical verified cash handover",idempotencyKey:randomUUID(),attest:true};
      expect((await call(a,"POST",endpoint,proposal)).response.status()).toBe(428);
      await stepUp(a,process.env.E2E_ADMIN_PASSWORD);
      const handover=await ok(a,"POST",endpoint,proposal);
      expect(handover.status).toBe("PENDING");
      expect((await ok(a,"POST",endpoint,proposal)).id).toBe(handover.id);
      const rejectedClose=await call(a,"POST",root+"/cash-sessions/"+source.id+"/close",{revision:source.revision,countedClosingAmount:"70",counts:[{denomination:"10",quantity:7}],approverUserId:recipient.id});
      expect(rejectedClose.response.status(),JSON.stringify(rejectedClose.body)).toBe(409);
      expect(rejectedClose.body.error).toBe("CASH_HANDOVER_PENDING");
      const decision={action:"ACCEPT",handoverId:handover.id,revision:1,reason:"Received verified physical cash",attest:true};
      expect((await call(a,"POST",endpoint,decision)).response.status()).toBe(403);
      await stepUp(b,process.env.E2E_USER_PASSWORD);
      expect((await ok(b,"POST",root+"/cash-sessions/"+target.id+"/handover",decision)).status).toBe("ACCEPTED");
      expect((await call(b,"POST",root+"/cash-sessions/"+target.id+"/handover",decision)).response.status()).toBe(409);
      const movements=await prisma.enterpriseCashMovement.findMany({where:{organizationId,reference:"HANDOVER:"+handover.id}});
      expect(movements).toHaveLength(2);
      expect(movements.find(m=>m.cashSessionId===source.id).direction).toBe("OUTBOUND");
      expect(movements.find(m=>m.cashSessionId===target.id).direction).toBe("INBOUND");
      expect((await prisma.enterpriseFinancialAccount.findUniqueOrThrow({where:{id:cash.id}})).operationalBalance.toFixed()).toBe("100");
      const listed=(await ok(a,"GET",root+"/cash-sessions?recordId="+source.id)).items[0];
      expect(String(listed.expectedCurrentAmount)).toBe("50");
      const page=await a.newPage();
      await page.goto(base+path+"?recordId="+source.id);
      await expect(page.getByText("Passations physiques entre caissiers",{exact:true})).toBeVisible();
      for(const width of [320,360,375,390,414,768,1024]){
        await page.setViewportSize({width,height:844});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
      }
      const close=(await ok(a,"POST",root+"/cash-sessions/"+source.id+"/close",{revision:listed.revision,countedClosingAmount:"55",counts:[{denomination:"5",quantity:11}],closingReason:"Count requires independent review",approverUserId:recipient.id})).session;
      expect(String(close.expectedClosingAmount)).toBe("50");
      expect(String(close.discrepancyAmount)).toBe("5");
      const approved=(await ok(b,"POST",root+"/cash-sessions/"+source.id+"/validate",{revision:close.revision,approve:true})).session;
      expect(approved.status).toBe("CLOSED");
      const discrepancy=await prisma.enterpriseCashDiscrepancy.findFirstOrThrow({where:{organizationId,cashSessionId:source.id}});
      expect(discrepancy.status).toBe("PENDING_QUALIFICATION");
      expect(await prisma.enterpriseJournalEntry.count({where:{organizationId,sourceEntityType:"EnterpriseCashDiscrepancy",sourceEntityId:discrepancy.id}})).toBe(0);
      expect((await prisma.enterpriseFinancialAccount.findUniqueOrThrow({where:{id:cash.id}})).operationalBalance.toFixed()).toBe("100");
    }finally{await a.close();await b.close();}
  });
  test("Excel round trip, partial/grouped reservations, release, independent approval and dated balance",async({browser})=>{
    const [a,b]=await contextPair(browser);
    try{
      const bank=await account("BANK",100,250);
      const day="2026-11-24";
      const when=new Date(day+"T10:00:00Z");
      const next=new Date("2026-11-25T10:00:00Z");
      const transactions=[];
      for(const [amount,reference,transactionDate] of [[70,"R70",when],[50,"R50",when],[10,"EXACT",when],[20,"NEXT",next]]){
        transactions.push(await prisma.enterpriseTreasuryTransaction.create({data:{organizationId,financialAccountId:bank.id,transactionType:"TEST_RECEIPT",direction:"INBOUND",currencyCode:"USD",amount,reference,transactionDate,createdByUserId:owner.id}}));
      }
      const downloaded=await a.request.get(base+root+"/bank-statements/template?financialAccountId="+bank.id);
      expect(downloaded.ok(),await downloaded.text()).toBeTruthy();
      const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await downloaded.body());
      const sheet=workbook.getWorksheet("Données");
      expect(sheet.getCell("A1").value).toBe("transactionDate");
      sheet.addRow([day,"","Grouped receipt","GROUP1","","0","100","200"]);
      sheet.addRow([day,"","Second receipt","GROUP2","","0","20","220"]);
      sheet.addRow([day,"","Exact receipt","EXACT","","0","10","230"]);
      const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
      const preview=await a.request.post(base+root+"/bank-statements/template",{headers:{origin:base,referer:base+path},multipart:{file:{name:"statement.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:bytes}}});
      const parsed=await preview.json().catch(()=>null);
      expect(preview.ok(),JSON.stringify(parsed)).toBeTruthy();
      expect(parsed.lines).toHaveLength(3);
      const statementInput={financialAccountId:bank.id,reference:"H1226-"+randomUUID(),statementDate:day,periodStart:day,periodEnd:day,currencyCode:"USD",openingBalance:"100",closingBalance:"230",lines:parsed.lines};
      expect((await call(a,"POST",root+"/bank-statements",{...statementInput,closingBalance:"231"})).response.status()).toBe(422);
      const statement=(await ok(a,"POST",root+"/bank-statements",statementInput)).statement;
      const session=(await ok(a,"POST",root+"/reconciliations",{financialAccountId:bank.id,bankStatementId:statement.id,periodStart:day,periodEnd:day})).session;
      expect(String(session.bookBalance)).toBe("230");
      const rec=root+"/reconciliations/"+session.id;
      let detail=(await ok(a,"GET",rec)).reconciliation;
      expect(detail.exactSuggestions).toHaveLength(1);
      const lines=detail.statementLines;
      const allocate=(line,transaction,matchedAmount)=>ok(a,"POST",rec+"/matches",{bankStatementLineId:line.id,treasuryTransactionId:transaction.id,matchedAmount});
      const first=(await allocate(lines[0],transactions[0],"70")).match;
      expect(first.status).toBe("RESERVED");
      expect((await prisma.enterpriseTreasuryTransaction.findUniqueOrThrow({where:{id:transactions[0].id}})).reconciliationStatus).toBe("UNRECONCILED");
      detail=(await ok(a,"GET",rec)).reconciliation;
      await ok(a,"PATCH",rec,{revision:detail.revision,matchId:first.id,reason:"Release synthetic reservation"});
      expect((await prisma.enterpriseReconciliationMatch.findUniqueOrThrow({where:{id:first.id}})).status).toBe("CANCELLED");
      await allocate(lines[0],transactions[0],"70");
      await allocate(lines[0],transactions[1],"30");
      await allocate(lines[1],transactions[1],"20");
      await allocate(lines[2],transactions[2],"10");
      detail=(await ok(a,"GET",rec)).reconciliation;
      expect(detail.statementLines.every(line=>Number(line.remainingAmount)===0)).toBeTruthy();
      expect((await call(a,"POST",rec+"/complete",{action:"SUBMIT",revision:detail.revision,approverUserId:owner.id})).response.status()).toBe(409);
      const submitted=(await ok(a,"POST",rec+"/complete",{action:"SUBMIT",revision:detail.revision,approverUserId:recipient.id})).session;
      expect((await prisma.enterpriseBankStatement.findUniqueOrThrow({where:{id:statement.id}})).status).toBe("IMPORTED");
      const final=(await ok(b,"POST",rec+"/complete",{action:"APPROVE",revision:submitted.revision})).session;
      expect(final.status).toBe("COMPLETED");
      expect((await prisma.enterpriseFinancialAccount.findUniqueOrThrow({where:{id:bank.id}})).reconciledBalance.toFixed()).toBe("230");
      const states=await prisma.enterpriseTreasuryTransaction.findMany({where:{organizationId,financialAccountId:bank.id}});
      expect(states.filter(t=>t.reconciliationStatus==="RECONCILED")).toHaveLength(3);
      expect(states.find(t=>t.id===transactions[3].id).reconciliationStatus).toBe("UNRECONCILED");
    }finally{await a.close();await b.close();}
  });
  test("legacy no-site other product is traced to its exact journal and reversed only by independent cash review",async({browser})=>{
    const [a,b]=await contextPair(browser);
    let c;
    try{
      const reviewerEmail="h1226-reviewer-"+randomUUID()+"@example.test";
      const reviewer=await prisma.user.create({data:{email:reviewerEmail,name:"Synthetic Independent Reviewer",passwordHash:owner.passwordHash,role:"CLIENT",status:"ACTIVE",locale:"fr",startPage:"/dashboard"}});
      await prisma.organizationMember.create({data:{organizationId,userId:reviewer.id,role:"ADMIN_ENTERPRISE",status:"ACTIVE",joinedAt:new Date()}});
      c=await signIn(browser,reviewerEmail,process.env.E2E_ADMIN_PASSWORD);
      await stepUp(c,process.env.E2E_ADMIN_PASSWORD);
      const cash=await account("CASH",100,100);
      const opened=(await ok(a,"POST",root+"/cash-sessions",{financialAccountId:cash.id,openingAmount:"100"})).session;
      const close=(await ok(a,"POST",root+"/cash-sessions/"+opened.id+"/close",{revision:opened.revision,countedClosingAmount:"105",counts:[{denomination:"5",quantity:21}],closingReason:"Synthetic legacy count error",approverUserId:recipient.id})).session;
      expect((await call(b,"POST",root+"/cash-sessions/"+opened.id+"/validate",{revision:close.revision,approve:true})).response.status()).toBe(428);
      await stepUp(b,process.env.E2E_USER_PASSWORD);
      const approved=(await ok(b,"POST",root+"/cash-sessions/"+opened.id+"/validate",{revision:close.revision,approve:true})).session;
      const discrepancy=await prisma.enterpriseCashDiscrepancy.findFirstOrThrow({where:{organizationId,cashSessionId:opened.id}});
      const now=new Date(),from=new Date(now);from.setUTCDate(from.getUTCDate()-2);
      const to=new Date(now);to.setUTCDate(to.getUTCDate()+2);
      let period=await prisma.enterpriseFiscalPeriod.findFirst({where:{organizationId,startDate:{lte:now},endDate:{gte:now},status:"OPEN",fiscalYear:{status:"OPEN"}},orderBy:{startDate:"desc"}});
      if(!period){
        const year=await prisma.enterpriseFiscalYear.findFirst({where:{organizationId,startDate:{lte:now},endDate:{gte:now},status:"OPEN"}});
        if(!year)throw new Error("Synthetic fiscal year not seeded");
        period=await prisma.enterpriseFiscalPeriod.create({data:{organizationId,fiscalYearId:year.id,code:"H1226-"+randomUUID(),startDate:from,endDate:to,status:"OPEN",createdByUserId:owner.id}});
      }
      const other=await prisma.enterpriseLedgerAccount.create({data:{organizationId,chartId:ledger.chartId,code:"H1226-OTHER-"+randomUUID().slice(0,8),nameFr:"Autres produits fictifs",nameEn:"Synthetic other income",accountType:"OTHER_INCOME",currencyCode:"USD",isActive:true,allowDirectPosting:true}});
      const journal=await prisma.enterpriseJournal.findFirstOrThrow({where:{organizationId,isActive:true}});
      const number="H1226-LEGACY-"+randomUUID().slice(0,8);
      const original=await prisma.enterpriseJournalEntry.create({data:{organizationId,number,journalId:journal.id,fiscalPeriodId:period.id,accountingDate:now,description:"Synthetic old cash variance without site",sourceModule:"FINANCE_CASH",sourceEntityType:"EnterpriseCashDiscrepancy",sourceEntityId:discrepancy.id,postingEvent:"CASH_VARIANCE_POSTED",status:"POSTED",totalDebit:"5",totalCredit:"5",functionalCurrencyCode:"USD",preparedByUserId:owner.id,approvedByUserId:recipient.id,postedByUserId:recipient.id,postedAt:now}});
      await prisma.enterpriseJournalLine.createMany({data:[
        {organizationId,journalEntryId:original.id,ledgerAccountId:ledger.id,debit:"5",credit:"0",functionalAmount:"5",transactionCurrencyCode:"USD",transactionAmount:"5",exchangeRate:"1"},
        {organizationId,journalEntryId:original.id,ledgerAccountId:other.id,debit:"0",credit:"5",functionalAmount:"5",transactionCurrencyCode:"USD",transactionAmount:"5",exchangeRate:"1"}
      ]});
      await prisma.enterpriseCashDiscrepancy.update({where:{id:discrepancy.id},data:{status:"APPROVED",journalEntryId:original.id,approvedByUserId:recipient.id}});
      const trace=root+"/retail/financial-drilldown?from="+from.toISOString().slice(0,10)+"&to="+to.toISOString().slice(0,10)+"&currency=USD&search="+encodeURIComponent(number);
      const details=await ok(c,"GET",trace+"&metric=postedOtherProducts");
      expect(details.lines).toHaveLength(1);
      expect(details.lines[0]).toMatchObject({siteId:null,sourceType:"EnterpriseJournalEntry",sourceId:original.id,amount:"5.000000"});
      expect((await ok(c,"GET",trace+"&metric=postedSalesRevenue")).totalLines).toBe(0);
      expect((await ok(c,"GET",trace+"&metric=postedOtherProducts&siteId="+site.id)).totalLines).toBe(0);
      const exact=(await ok(c,"GET",root+"/journal-entries?recordId="+original.id)).items;
      expect(exact).toHaveLength(1);
      expect(exact[0].capabilities).toMatchObject({canReverse:false,reverseBlockReason:"CASH_VARIANCE_REVIEW_REQUIRED"});
      const page=await c.newPage();
      await page.goto(base+"/enterprise-modules/FINANCE_ACCOUNTING?recordId="+original.id+"&entityType=EnterpriseJournalEntry");
      await expect(page.getByText("Régularisez cet écart depuis sa session de caisse source.",{exact:false})).toBeVisible();
      const endpoint=root+"/cash-sessions/"+opened.id+"/variance-review";
      const correction={discrepancyId:discrepancy.id,revision:approved.revision,decision:"CORRECT_COUNT",verifiedCount:"100",reason:"Synthetic independently verified original count error",evidenceReference:"PV-H1226-TEST",attest:true};
      await stepUp(a,process.env.E2E_ADMIN_PASSWORD);
      expect((await call(a,"POST",endpoint,correction)).response.ok()).toBeFalsy();
      const result=await ok(c,"POST",endpoint,correction);
      expect(result.discrepancy.status).toBe("LEGACY_REVERSED");
      const reversal=await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:result.reversalEntryId},include:{lines:true}});
      expect(reversal.reversalOfEntryId).toBe(original.id);
      expect(reversal.lines.find(line=>line.ledgerAccountId===other.id).debit.toFixed()).toBe("5");
      expect(reversal.lines.every(line=>line.siteId===null)).toBeTruthy();
      expect((await prisma.enterpriseJournalEntry.findUniqueOrThrow({where:{id:original.id}})).status).toBe("REVERSED");
      expect((await prisma.enterpriseFinancialAccount.findUniqueOrThrow({where:{id:cash.id}})).operationalBalance.toFixed()).toBe("100");
      expect(await prisma.enterpriseTreasuryTransaction.count({where:{organizationId,financialAccountId:cash.id}})).toBe(0);
      expect((await call(c,"POST",endpoint,correction)).response.ok()).toBeFalsy();
      expect(await prisma.enterpriseJournalReversal.count({where:{organizationId,originalEntryId:original.id}})).toBe(1);
      // The physical reconciliation requires independent approval and a fresh count.
      const physical={financialAccountId:cash.id,physicalCount:"100",periodStart:now.toISOString(),periodEnd:now.toISOString(),evidenceReference:"PV-H1226-PHYSICAL",attest:true};
      const incorrect=(await ok(c,"POST",root+"/reconciliations",{...physical,physicalCount:"105"})).session;
      const incorrectEndpoint=root+"/reconciliations/"+incorrect.id;
      expect((await call(c,"POST",incorrectEndpoint+"/complete",{action:"SUBMIT",revision:incorrect.revision,approverUserId:recipient.id})).response.status()).toBe(409);
      await ok(c,"PATCH",incorrectEndpoint,{revision:incorrect.revision,reason:"Correct inaccurate synthetic count"});
      const stale=(await ok(c,"POST",root+"/reconciliations",physical)).session;
      const staleEndpoint=root+"/reconciliations/"+stale.id;
      const reopened=(await ok(a,"POST",root+"/cash-sessions",{financialAccountId:cash.id,openingAmount:"100"})).session;
      expect((await call(c,"POST",staleEndpoint+"/complete",{action:"SUBMIT",revision:stale.revision,approverUserId:recipient.id})).response.status()).toBe(409);
      await ok(c,"PATCH",staleEndpoint,{revision:stale.revision,reason:"Cash session opened after count"});
      const closed=(await ok(a,"POST",root+"/cash-sessions/"+reopened.id+"/close",{revision:reopened.revision,countedClosingAmount:"100",counts:[{denomination:"10",quantity:10}],approverUserId:recipient.id})).session;
      await ok(b,"POST",root+"/cash-sessions/"+reopened.id+"/validate",{revision:closed.revision,approve:true});
      const fresh=(await ok(c,"POST",root+"/reconciliations",physical)).session;
      const freshEndpoint=root+"/reconciliations/"+fresh.id+"/complete";
      const submitted=(await ok(c,"POST",freshEndpoint,{action:"SUBMIT",revision:fresh.revision,approverUserId:recipient.id})).session;
      // Remove only the short-lived step-up cookie, not the authenticated session.
      await b.clearCookies({name:"dtsc_stepup"});
      expect((await call(b,"POST",freshEndpoint,{action:"APPROVE",revision:submitted.revision})).response.status()).toBe(428);
      await stepUp(b,process.env.E2E_USER_PASSWORD);
      const reconciled=(await ok(b,"POST",freshEndpoint,{action:"APPROVE",revision:submitted.revision})).session;
      expect(reconciled.status).toBe("COMPLETED");
      const balances=await prisma.enterpriseFinancialAccount.findUniqueOrThrow({where:{id:cash.id}});
      expect(balances.operationalBalance.toFixed()).toBe("100");
      expect(balances.reconciledBalance.toFixed()).toBe("100");
      expect(await prisma.enterpriseTreasuryTransaction.count({where:{organizationId,financialAccountId:cash.id}})).toBe(0);
    }finally{await a.close();await b.close();if(c)await c.close();}
  });

});
