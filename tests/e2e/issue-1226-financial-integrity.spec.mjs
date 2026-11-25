import {expect,test} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {createClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import ExcelJS from "exceljs";
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";

// This scenario writes synthetic fixtures only in the isolated #662 CI job.
if(process.env.CI!=="true" || !/^postgresql:\/\/[^@]+@localhost:5432\/dtsc_hotfix_662_acceptance(?:\?|$)/.test(process.env.DATABASE_URL||"")) throw new Error("Financial #1226 E2E requires disposable CI PostgreSQL");
const prisma=new PrismaClient();
const organizationId=process.env.E2E_ORGANIZATION_ID||"e2e-erp-professional-org";
const base=process.env.E2E_BASE_URL||"http://127.0.0.1:3000";
if(new URL(base).hostname!=="127.0.0.1")throw new Error("Financial #1226 E2E requires local application");
const root="/api/enterprise/"+organizationId;
const path="/enterprise-modules/FINANCE_CASH";
let owner,recipient,ledger,site,visualSessionId;
const authenticatedContexts=new Map();
let canonicalReviewers=[];
async function signIn(browser,email,password){
  // Reuse real authenticated sessions rather than exhausting or resetting the
  // application's eight-sign-ins-per-address policy in this serial suite.
  if(authenticatedContexts.has(email))return authenticatedContexts.get(email);
  const context=await browser.newContext({baseURL:base,viewport:{width:390,height:844}});
  const response=await context.request.post(base+"/api/auth/sign-in",{data:{email,password,organizationId,next:path},headers:{origin:base,referer:base+"/auth/sign-in"}});
  expect(response.ok(),await response.text()).toBeTruthy();
  authenticatedContexts.set(email,context);
  return context;
}
async function releaseContext(context){
  if(!context)return;
  await Promise.all(context.pages().map(page=>page.close()));
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
  if((await ok(context,"GET","/api/auth/step-up")).verified)return;
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
    for(const [index,moduleCode] of ["FINANCE_CASH","FINANCE_BANK","FINANCE_RECONCILIATION","FINANCE_ACCOUNTING","FINANCE_TREASURY","FINANCE_PAYMENTS","FINANCE_OVERVIEW","VALIDATIONS","RETAIL_DAILY_CLOSE"].entries()){
      await prisma.enterpriseModule.upsert({where:{organizationId_moduleCode:{organizationId,moduleCode}},update:{isEnabled:true},create:{organizationId,moduleCode,labelFr:moduleCode,labelEn:moduleCode,moduleCategory:"E2E_1226",isEnabled:true,isCore:false,requiresPlanLevel:"BUSINESS",sortOrder:12260+index}});
    }
  });
  test.afterAll(async()=>{await Promise.all([...authenticatedContexts.values()].map(context=>context.close()));await prisma.$disconnect();});
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
    }finally{await releaseContext(a);await releaseContext(b);}
  });
  test("Excel round trip, partial/grouped reservations, release, independent approval and dated balance",async({browser})=>{
    const [a,b]=await contextPair(browser);
    try{
      const bank=await account("BANK",100,250);
      await prisma.enterpriseFinancialAccount.update({where:{id:bank.id},data:{maskedReference:"AB12"}});
      const masked=(await ok(a,"GET",root+"/financial-accounts?recordId="+bank.id)).items[0];
      expect(masked.maskedReference).toBe("••••");
      // Existing #662 recipe creates store closings in this disposable tenant.
      const exportQuery=root+"/retail/daily-close?export=1";
      const filtered=await ok(a,"GET",exportQuery+"&siteId="+site.id);
      expect(Array.isArray(filtered.rows)).toBeTruthy();
      const fixture=await prisma.enterpriseRetailDailyClose.findFirstOrThrow({where:{organizationId,siteId:site.id,lines:{some:{}}},include:{lines:true}});
      const exactExport=await ok(a,"GET",exportQuery+"&siteId="+site.id+"&search="+encodeURIComponent(fixture.number));
      expect(exactExport.rows.length).toBe(fixture.lines.length);
      expect(exactExport.rows.every(row=>row.number===fixture.number && row.currencyCode && typeof row.declaredBalance==="string")).toBeTruthy();
      expect(new Set(exactExport.rows.map(row=>row.id))).toEqual(new Set(fixture.lines.map(line=>line.id)));
      const excluded=await ok(a,"GET",exportQuery+"&siteId=missing-"+randomUUID()+"&search="+encodeURIComponent(fixture.number));
      expect(excluded.rows).toHaveLength(0);
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
      const repeated=await call(a,"POST",root+"/bank-statements",{...statementInput,reference:"H1226-DUP-"+randomUUID()});
      expect(repeated.response.status(),JSON.stringify(repeated.body)).toBe(409);
      expect(repeated.body.error).toBe("BANK_STATEMENT_PERIOD_OVERLAP");
      expect(await prisma.enterpriseBankStatement.count({where:{organizationId,financialAccountId:bank.id}})).toBe(1);
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
    }finally{await releaseContext(a);await releaseContext(b);}
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
      await b.clearCookies({name:"dtsc_stepup"});
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
      const selfReview=await call(a,"POST",endpoint,correction);
      expect(selfReview.response.status(),JSON.stringify(selfReview.body)).toBe(409);
      expect(selfReview.body.error).toBe("CASH_VARIANCE_REVIEW_FORBIDDEN");
      // Workspace navigation can rotate the session token. Step-up is bound to
      // that exact token; repeat it immediately before the critical action.
      await page.close(); // Stop workspace polling before issuing the token-bound step-up.
      await stepUp(c,process.env.E2E_ADMIN_PASSWORD);
      expect((await ok(c,"GET","/api/auth/step-up")).verified).toBe(true);
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
      const templatePath=root+"/reconciliations/physical-count-template?financialAccountId="+cash.id;
      const template=await c.request.get(base+templatePath);expect(template.ok(),await template.text()).toBeTruthy();
      const book=new ExcelJS.Workbook();await book.xlsx.load(await template.body());
      const sheet=book.getWorksheet("Comptage");expect(sheet.getCell("A1").value).toBe("denomination");
      sheet.getCell("B2").value=1;
      const file=Buffer.from(await book.xlsx.writeBuffer());
      const preview=await c.request.post(base+templatePath,{headers:{origin:base,referer:base+path},multipart:{file:{name:"count.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:file}}});
      expect(preview.ok(),await preview.text()).toBeTruthy();const imported=await preview.json();expect(imported.physicalCount).toBe("100");
      expect((await call(c,"POST",root+"/reconciliations",{...physical,physicalCounts:imported.counts,physicalCount:"99"})).response.status()).toBe(422);
      const fresh=(await ok(c,"POST",root+"/reconciliations",{...physical,physicalCounts:imported.counts})).session;
      expect(fresh.physicalEvidenceJson.counts).toEqual(imported.counts);
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
    }finally{await releaseContext(a);await releaseContext(b);await releaseContext(c);}
  });

  for(const kind of ["FUNDING","TRANSFER","PAYMENT"])test(`canonical ${kind} evidence is linked exactly once without a second movement or posting`,async({browser})=>{
    // Confirmed source fixtures isolate this new evidence-review boundary. They
    // do not claim to certify creation/approval of the three source workflows.
    const [a,b]=await contextPair(browser);
    let c,d;
    try{
      for(const suffix of canonicalReviewers.length?[]:["link","unlink"]){
        const user=await prisma.user.create({data:{email:`h1226-${suffix}-${randomUUID()}@example.test`,name:"Synthetic evidence reviewer",passwordHash:owner.passwordHash,role:"CLIENT",status:"ACTIVE",locale:"fr",startPage:"/dashboard"}});
        await prisma.organizationMember.create({data:{organizationId,userId:user.id,role:"ADMIN_ENTERPRISE",status:"ACTIVE",joinedAt:new Date()}});
        canonicalReviewers.push(user);
      }
      const reviewers=canonicalReviewers;
      c=await signIn(browser,reviewers[0].email,process.env.E2E_ADMIN_PASSWORD);
      d=await signIn(browser,reviewers[1].email,process.env.E2E_ADMIN_PASSWORD);
      const outbound=kind==="PAYMENT",count=outbound?"95":"105";
      const cash=await account("CASH",100,100);
      const opened=(await ok(a,"POST",root+"/cash-sessions",{financialAccountId:cash.id,openingAmount:"100"})).session;
      const endpoint=root+"/cash-sessions/"+opened.id+"/variance-review";
      const close=(await ok(a,"POST",root+"/cash-sessions/"+opened.id+"/close",{revision:opened.revision,countedClosingAmount:count,counts:[{denomination:"1",quantity:Number(count)}],closingReason:"Synthetic omitted canonical operation",approverUserId:recipient.id})).session;
      await stepUp(b,process.env.E2E_USER_PASSWORD);
      const closed=(await ok(b,"POST",root+"/cash-sessions/"+opened.id+"/validate",{revision:close.revision,approve:true})).session;
      const discrepancy=await prisma.enterpriseCashDiscrepancy.findFirstOrThrow({where:{organizationId,cashSessionId:opened.id}});
      const now=new Date(),number="H1226-SOURCE-"+randomUUID().slice(0,8);
      const sourceEntityType=kind==="FUNDING"?"EnterpriseFundingOperation":kind==="TRANSFER"?"EnterpriseAccountTransfer":"EnterprisePayment";
      const counterpart=await prisma.enterpriseLedgerAccount.create({data:{organizationId,chartId:ledger.chartId,code:number,nameFr:"Contrepartie fictive",nameEn:"Synthetic counterpart",accountType:kind==="FUNDING"?"EQUITY":kind==="TRANSFER"?"ASSET":"LIABILITY",currencyCode:"USD",isActive:true,allowDirectPosting:true}});
      let source;
      if(kind==="FUNDING")source=await prisma.enterpriseFundingOperation.create({data:{organizationId,number,fundingType:"CAPITAL_CONTRIBUTION",financialAccountId:cash.id,currencyCode:"USD",amount:"5",operationDate:opened.openedAt,status:"CONFIRMED",initiatedByUserId:owner.id,approvedByUserId:recipient.id,confirmedByUserId:recipient.id,confirmedAt:now}});
      if(kind==="PAYMENT")source=await prisma.enterprisePayment.create({data:{organizationId,number,direction:"OUTBOUND",paymentType:"SUPPLIER_PAYMENT",methodType:"CASH",financialAccountId:cash.id,currencyCode:"USD",amount:"5",unallocatedAmount:"5",paymentDate:opened.openedAt,status:"CONFIRMED",initiatedByUserId:owner.id,approvedByUserId:recipient.id,confirmedByUserId:recipient.id,confirmedAt:now}});
      if(kind==="TRANSFER"){
        const bank=await prisma.enterpriseFinancialAccount.create({data:{organizationId,code:number,name:"Synthetic transfer source",accountType:"BANK",currencyCode:"USD",openingBalance:"100",operationalBalance:"95",ledgerAccountId:counterpart.id,siteId:site.id,status:"ACTIVE"}});
        source=await prisma.enterpriseAccountTransfer.create({data:{organizationId,number,sourceFinancialAccountId:bank.id,targetFinancialAccountId:cash.id,sourceCurrencyCode:"USD",targetCurrencyCode:"USD",sourceAmount:"5",targetAmount:"5",transferDate:opened.openedAt,status:"CONFIRMED",initiatedByUserId:owner.id,approvedByUserId:recipient.id,confirmedAt:now}});
        await prisma.enterpriseTreasuryTransaction.create({data:{organizationId,financialAccountId:bank.id,transferId:source.id,transactionType:"TRANSFER",direction:"OUTBOUND",currencyCode:"USD",amount:"5",transactionDate:opened.openedAt,createdByUserId:recipient.id}});
      }
      const sourceField=kind==="FUNDING"?{fundingOperationId:source.id}:kind==="PAYMENT"?{paymentId:source.id}:{transferId:source.id};
      const transaction=await prisma.enterpriseTreasuryTransaction.create({data:{organizationId,financialAccountId:cash.id,...sourceField,transactionType:kind==="PAYMENT"?"SUPPLIER_PAYMENT":kind,direction:outbound?"OUTBOUND":"INBOUND",currencyCode:"USD",amount:"5",transactionDate:opened.openedAt,createdByUserId:recipient.id}});
      await prisma.enterpriseFinancialAccount.update({where:{id:cash.id},data:{operationalBalance:count,revision:{increment:1}}});
      const period=await prisma.enterpriseFiscalPeriod.findFirstOrThrow({where:{organizationId,startDate:{lte:now},endDate:{gte:now},status:"OPEN",fiscalYear:{status:"OPEN"}}});
      const journal=await prisma.enterpriseJournal.findFirstOrThrow({where:{organizationId,isActive:true}});
      const entry=await prisma.enterpriseJournalEntry.create({data:{organizationId,number,journalId:journal.id,fiscalPeriodId:period.id,accountingDate:now,description:"Synthetic posted canonical source",sourceModule:kind==="PAYMENT"?"FINANCE_PAYMENTS":"FINANCE_TREASURY",sourceEntityType,sourceEntityId:source.id,status:"POSTED",totalDebit:"5",totalCredit:"5",functionalCurrencyCode:"USD",preparedByUserId:owner.id,approvedByUserId:recipient.id,postedByUserId:recipient.id,postedAt:now}});
      const postingEvent=kind==="FUNDING"?"CAPITAL_CONTRIBUTION_CONFIRMED":kind==="PAYMENT"?"SUPPLIER_PAYMENT_CONFIRMED":null;
      await prisma.enterpriseJournalEntry.update({where:{id:entry.id},data:{postingEvent,idempotencyKey:kind==="TRANSFER"?`${organizationId}:ACCOUNT_TRANSFER:${source.id}:1`:[organizationId,sourceEntityType,source.id,postingEvent,1].join(":"),postingVersion:1}});
      await prisma.enterpriseJournalLine.createMany({data:[
        {organizationId,journalEntryId:entry.id,ledgerAccountId:ledger.id,debit:outbound?"0":"5",credit:outbound?"5":"0",functionalAmount:"5",transactionCurrencyCode:"USD",transactionAmount:"5",exchangeRate:"1",siteId:site.id},
        {organizationId,journalEntryId:entry.id,ledgerAccountId:counterpart.id,debit:outbound?"5":"0",credit:outbound?"0":"5",functionalAmount:"5",transactionCurrencyCode:"USD",transactionAmount:"5",exchangeRate:"1",siteId:site.id}
      ]});
      const command={discrepancyId:discrepancy.id,revision:closed.revision,decision:"LINK_CANONICAL",canonicalTreasuryTransactionId:transaction.id,verifiedCount:count,evidenceReference:"SYNTHETIC-1226-PROOF",reason:"Independent verification of the original canonical source",attest:true};
      await c.clearCookies({name:"dtsc_stepup"});
      expect((await call(c,"POST",endpoint,command)).response.status()).toBe(428);
      await stepUp(c,process.env.E2E_ADMIN_PASSWORD);
      await stepUp(a,process.env.E2E_ADMIN_PASSWORD);
      expect((await call(a,"POST",endpoint,command)).body.error).toBe("CASH_VARIANCE_REVIEW_FORBIDDEN");
      const wrong=await account("CASH",100,105);
      const wrongTransaction=await prisma.enterpriseTreasuryTransaction.create({data:{organizationId,financialAccountId:wrong.id,...sourceField,transactionType:kind==="PAYMENT"?"SUPPLIER_PAYMENT":kind,direction:outbound?"OUTBOUND":"INBOUND",currencyCode:"USD",amount:"5",transactionDate:opened.openedAt,createdByUserId:recipient.id}});
      expect((await call(c,"POST",endpoint,{...command,canonicalTreasuryTransactionId:wrongTransaction.id})).body.error).toBe("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED");
      const candidates=await ok(c,"GET",endpoint);
      expect(candidates.items.map(item=>item.id)).toContain(transaction.id);
      expect(candidates.items.map(item=>item.id)).not.toContain(wrongTransaction.id);
      const before={treasury:await prisma.enterpriseTreasuryTransaction.count({where:{organizationId}}),cash:await prisma.enterpriseCashMovement.count({where:{organizationId}}),journal:await prisma.enterpriseJournalEntry.count({where:{organizationId}})};
      const results=await Promise.all([call(c,"POST",endpoint,command),call(c,"POST",endpoint,command)]);
      expect(results.map(r=>r.response.status()).sort()).toEqual([200,409]);
      const resolved=await prisma.enterpriseCashDiscrepancy.findUniqueOrThrow({where:{id:discrepancy.id}});
      expect(resolved.status).toBe("RESOLVED_CANONICAL");expect(resolved.canonicalTreasuryTransactionId).toBe(transaction.id);expect(resolved.journalEntryId).toBeNull();
      await expect(prisma.enterpriseCashDiscrepancy.create({data:{organizationId,cashSessionId:opened.id,amount:"5",reason:"Duplicate evidence must be refused",status:"RESOLVED_CANONICAL",canonicalTreasuryTransactionId:transaction.id,createdByUserId:owner.id}})).rejects.toMatchObject({code:"P2002"});
      expect(await prisma.enterpriseTreasuryTransaction.count({where:{organizationId}})).toBe(before.treasury);
      expect(await prisma.enterpriseCashMovement.count({where:{organizationId}})).toBe(before.cash);
      expect(await prisma.enterpriseJournalEntry.count({where:{organizationId}})).toBe(before.journal);
      const snapshot=await prisma.enterpriseCashSession.findUniqueOrThrow({where:{id:opened.id}});
      expect(snapshot.expectedClosingAmount.toFixed()).toBe("100");expect(snapshot.countedClosingAmount.toFixed()).toBe(count);
      expect((await prisma.enterpriseFinancialAccount.findUniqueOrThrow({where:{id:cash.id}})).operationalBalance.toFixed()).toBe(count);
      const listed=(await ok(c,"GET",root+"/cash-sessions?recordId="+opened.id)).items[0];
      expect(listed.varianceReviews[0].canReview).toBe(false);
      expect(listed.varianceReviews[0].canonicalSourceHref).toContain(source.id);
      const page=await d.newPage();
      await page.goto(base+listed.varianceReviews[0].canonicalSourceHref);
      await expect(page.getByRole("dialog").getByText(number,{exact:true}).last()).toBeVisible();
      await page.close();
      expect((await ok(c,"GET","/api/auth/step-up")).verified).toBe(true);
      const refusedReverse=await call(c,"POST",root+"/journal-entries/"+entry.id+"/reverse",{reason:"Source correction requires independent unlink",accountingDate:now.toISOString(),revision:entry.revision});
      expect(refusedReverse.response.status(),JSON.stringify(refusedReverse.body)).toBe(409);expect(refusedReverse.body.error).toBe("CASH_VARIANCE_CANONICAL_LINK_ACTIVE");
      await stepUp(d,process.env.E2E_ADMIN_PASSWORD);
      expect((await ok(d,"POST",endpoint,{...command,revision:snapshot.revision,decision:"UNLINK_CANONICAL"})).discrepancy.status).toBe("PENDING_QUALIFICATION");
      expect(await prisma.enterpriseOperationalEvent.count({where:{organizationId,entityId:discrepancy.id,eventType:"CASH_VARIANCE_CANONICAL_LINKED"}})).toBe(1);
      expect(await prisma.enterpriseOperationalEvent.count({where:{organizationId,entityId:discrepancy.id,eventType:"CASH_VARIANCE_CANONICAL_UNLINKED"}})).toBe(1);
      if(kind==="FUNDING")visualSessionId=opened.id;
    }finally{await releaseContext(a);await releaseContext(b);await releaseContext(c);await releaseContext(d);}
  });
  test("durable Mobile Money import validates private staged content, retry identity and overlapping statement exclusion",async({browser})=>{
    const a=await signIn(browser,process.env.E2E_ADMIN_EMAIL,process.env.E2E_ADMIN_PASSWORD);
    try{
      const storageUrl = "http://127.0.0.1:54321";
      const bucket = "dtsc-ci-private";
      expect(process.env.SUPABASE_STORAGE_URL).toBe(storageUrl);
      expect(process.env.SUPABASE_STORAGE_BUCKET).toBe(bucket);
      expect(Boolean(process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY && process.env.E2E_SUPABASE_ANON_KEY)).toBe(true);
      const auth = { persistSession: false, autoRefreshToken: false };
      const serverStorage = createClient(storageUrl, process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, {auth}).storage;
      const anonStorage = createClient(storageUrl, process.env.E2E_SUPABASE_ANON_KEY, {auth}).storage;
      const bank=await account("MOBILE_MONEY",0,251);
      const day="2026-11-24";
      const data={financialAccountId:bank.id,reference:"H1226-BULK-"+randomUUID(),statementDate:day,periodStart:day,periodEnd:day,currencyCode:"USD",openingBalance:"0",closingBalance:"251",lines:Array.from({length:251},(_,i)=>({transactionDate:day,description:"Synthetic operator credit "+i,reference:"OP-"+i,debit:"0",credit:"1",runningBalance:String(i+1)}))};
      const first=await call(a,"POST",root+"/bank-statements",data);
      expect(first.response.status(),JSON.stringify(first.body)).toBe(202);
      const id=first.body.job.id;
      expect((await ok(a,"POST",root+"/bank-statements",data)).job.id).toBe(id);
      const changed=await call(a,"POST",root+"/bank-statements",{...data,lines:data.lines.map((line,i)=>i===0?{...line,description:"Changed content"}:line)});
      expect(changed.response.status(),JSON.stringify(changed.body)).toBe(409);
      expect(changed.body.error).toBe("BANK_STATEMENT_RETRY_PAYLOAD_MISMATCH");
      const staged=await prisma.enterpriseDomainEvent.findUniqueOrThrow({where:{id}});
      expect(staged.payloadJson.lines).toBeUndefined();
      expect(staged.payloadJson.stagingPath).toContain("enterprise-bulk/"+organizationId+"/");
      const stagingPath = staged.payloadJson.stagingPath;
      const object = await serverStorage.from(bucket).download(stagingPath);
      expect(Boolean(object.error)).toBe(false);
      expect(object.data.size).toBeGreaterThan(0);
      const denied = await anonStorage.from(bucket).download(stagingPath);
      expect(denied.data).toBeNull();
      expect([400,401,403,404]).toContain(Number(denied.error?.status ?? denied.error?.statusCode));
      const publicUrl = anonStorage.from(bucket).getPublicUrl(stagingPath).data.publicUrl;
      expect([400,401,403,404]).toContain((await fetch(publicUrl)).status);
      const second=await call(a,"POST",root+"/bank-statements",{...data,reference:"H1226-BULK-OVERLAP-"+randomUUID()});
      expect(second.response.status(),JSON.stringify(second.body)).toBe(202);
      const other=second.body.job.id;
      const otherStaged=await prisma.enterpriseDomainEvent.findUniqueOrThrow({where:{id:other}});
      const url=base+"/api/internal/enterprise-bulk/process?batch=1";
      expect((await a.request.post(url)).status()).toBe(401);
      for(let i=0;i<8;i++){
        const response=await a.request.post(url,{headers:{authorization:"Bearer "+process.env.ENTERPRISE_BULK_WORKER_SECRET}});
        expect(response.ok(),await response.text()).toBeTruthy();
        const jobs=await prisma.enterpriseDomainEvent.findMany({where:{id:{in:[id,other]}}});
        if(jobs.every(job=>["PROCESSED","DEAD"].includes(job.processingStatus)))break;
      }
      const statuses=await Promise.all([id,other].map(async jobId=>(await ok(a,"GET",root+"/bank-statement-imports/"+jobId)).job));
      const completed=statuses.find(job=>job.status==="COMPLETED");
      const rejected=statuses.find(job=>job.status==="DEAD");
      expect(completed).toBeDefined();expect(rejected).toBeDefined();
      expect(completed.progressPercent).toBe(100);
      expect(completed.importedLineCount).toBe(251);
      expect(rejected.errorCode).toBe("BANK_STATEMENT_PERIOD_OVERLAP");
      const saved=await prisma.enterpriseBankStatement.findMany({where:{organizationId,financialAccountId:bank.id},include:{lines:true}});
      expect(saved).toHaveLength(1);expect(saved[0].status).toBe("IMPORTED");expect(saved[0].lines).toHaveLength(251);
      expect(saved[0].closingBalance.toFixed()).toBe("251");
      const importedPath = completed === statuses[0] ? stagingPath : otherStaged.payloadJson.stagingPath;
      const removed = await serverStorage.from(bucket).download(importedPath);
      expect(removed.data).toBeNull();
      expect([400,404]).toContain(Number(removed.error?.status ?? removed.error?.statusCode));
      const subsequent=await call(a,"POST",root+"/bank-statements",{...data,reference:"H1226-BULK-LATE-"+randomUUID()});
      expect(subsequent.response.status(),JSON.stringify(subsequent.body)).toBe(409);
      expect(subsequent.body.error).toBe("BANK_STATEMENT_PERIOD_OVERLAP");
    }finally{await releaseContext(a);}
  });

  test("Design 2.0 rendered FR/EN light/dark width matrix and canonical review form",async({browser})=>{
    test.setTimeout(240000);
    expect(visualSessionId).toBeTruthy();
    const reviewer=await prisma.user.create({data:{email:`h1226-visual-${randomUUID()}@example.test`,name:"Synthetic visual reviewer",passwordHash:owner.passwordHash,role:"CLIENT",status:"ACTIVE",locale:"fr",startPage:"/dashboard"}});
    await prisma.organizationMember.create({data:{organizationId,userId:reviewer.id,role:"ADMIN_ENTERPRISE",status:"ACTIVE",joinedAt:new Date()}});
    const directory=join(process.cwd(),"artifacts","1226-design2");await mkdir(directory,{recursive:true});
    const manifest=[];
    for(const locale of ["fr","en"]){
      await prisma.user.update({where:{id:reviewer.id},data:{locale}});
      for(const theme of ["light","dark"]){
        const authenticated=await signIn(browser,reviewer.email,process.env.E2E_ADMIN_PASSWORD);
        const context=await browser.newContext({baseURL:base,viewport:{width:390,height:844},storageState:await authenticated.storageState()});
        await context.addInitScript(value=>localStorage.setItem("theme",value),theme);
        const page=await context.newPage();
        try{
          for(const module of ["FINANCE_CASH","FINANCE_BANK","FINANCE_TREASURY","FINANCE_RECONCILIATION","RETAIL_DAILY_CLOSE"]){
            const response=await page.goto(base+"/enterprise-modules/"+module,{waitUntil:"networkidle"});
            expect(response.status()).toBe(200);expect(new URL(page.url()).pathname).toBe("/enterprise-modules/"+module);
            await expect(page.getByRole("heading",{level:1})).toBeVisible();
            await expect(page.locator("html")).toHaveClass(theme==="dark"?/dark/:/light/);
            for(const width of [320,360,375,390,414,768,1024,1440]){
              await page.setViewportSize({width,height:900});
              expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
              const file=`${module}-${locale}-${theme}-${width}.png`;
              await page.screenshot({path:join(directory,file)});
              manifest.push({module,locale,theme,width,file,title:await page.getByRole("heading",{level:1}).innerText()});
            }
          }
          await page.goto(base+path+"?recordId="+visualSessionId,{waitUntil:"networkidle"});
          await page.getByRole("button",{name:locale==="fr"?"Qualification et régularisation":"Variance review and correction",exact:true}).click();
          const dialog=page.getByRole("dialog");
          await expect(dialog.getByRole("button",{name:locale==="fr"?"Fermer":"Close",exact:true})).toBeVisible();
          await dialog.locator('select[name="decision"]').selectOption("LINK_CANONICAL");
          await expect(dialog.locator('select[name="canonicalTreasuryTransactionId"] option')).not.toHaveCount(1);
          for(const width of [320,360,375,390,414,768,1024,1440]){
            await page.setViewportSize({width,height:900});
            expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
            const file=`CANONICAL-REVIEW-${locale}-${theme}-${width}.png`;
            await page.screenshot({path:join(directory,file)});manifest.push({module:"CANONICAL-REVIEW",locale,theme,width,file});
          }
          await page.keyboard.press("Tab");
          expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
          await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();
          if(theme==="light"){
            const guides = locale==="fr"
              ? {FINANCE_CASH:"Caisse",FINANCE_BANK:"Banque et relevés",FINANCE_TREASURY:"Trésorerie, financements et transferts",FINANCE_RECONCILIATION:"Rapprochement bancaire"}
              : {FINANCE_CASH:"Cash sessions and variance review",FINANCE_BANK:"Bank and operator statements",FINANCE_TREASURY:"Treasury, funding and transfers",FINANCE_RECONCILIATION:"Cash, bank and operator reconciliation"};
            for(const [module,title] of Object.entries(guides)){
              const guide=await page.goto(base+"/help/enterprise?module="+module);
              expect(guide.status()).toBe(200);
              await expect(page.getByRole("heading",{level:1,name:title,exact:true})).toBeVisible();
              await expect(page.getByRole("link",{name:locale==="fr"?"Revenir au module":"Return to the module"})).toHaveAttribute("href","/enterprise-modules/"+module);
            }
            await page.goto(base+"/enterprise-modules/RETAIL_DAILY_CLOSE");
            await page.getByRole("button",{name:locale==="fr"?"Guide utilisateur":"User guide",exact:true}).click();
            await expect(page.getByRole("dialog",{name:locale==="fr"?"Guide Clôture magasin":"Store daily close guide"})).toBeVisible();
          }
        }finally{await authenticated.addCookies(await context.cookies());await context.close();}
      }
    }
    await writeFile(join(directory,"matrix.json"),JSON.stringify({candidateSha:process.env.E2E_CANDIDATE_SHA||null,executionSha:process.env.GITHUB_SHA||null,status:"RENDERED_AWAITING_VISUAL_INSPECTION",screens:manifest},null,2));
    expect(manifest).toHaveLength(192);
  });
});
