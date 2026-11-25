import { NextResponse } from "next/server";
import { authorizeFinanceRequest,financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { buildPhysicalCountXlsx,parsePhysicalCountXlsx } from "@/lib/enterprise/accounting/physical-count-xlsx";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
type Params={params:Promise<{organizationId:string}>};
async function prepare(req:Request,organizationId:string,mutation:boolean){
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_RECONCILIATION",mutation?"create":"view",mutation?{mutation:true,limit:30}:undefined);
  if(!auth.ok)return {response:auth.response} as const;
  if(!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_CASH",action:"view"}))return {response:NextResponse.json({error:"Forbidden"},{status:403})} as const;
  const account=await prisma.enterpriseFinancialAccount.findFirst({where:{organizationId,id:new URL(req.url).searchParams.get("financialAccountId")||"",accountType:"CASH",status:"ACTIVE",archivedAt:null},select:{code:true,name:true,currencyCode:true,siteId:true}});
  const scope=await retailFinanceReadSiteScope(organizationId,auth.session.userId,"CLOSE_CASH");
  if(!account||scope!==null&&(!account.siteId||!scope.includes(account.siteId)))return {response:NextResponse.json({error:"RECONCILIATION_ACCOUNT_INVALID"},{status:404})} as const;
  return {account,auth} as const;
}
export async function GET(req:Request,{params}:Params){
  const {organizationId}=await params,startedAt=Date.now(),context=await prepare(req,organizationId,false);
  if("response" in context)return context.response;
  const bytes=await buildPhysicalCountXlsx(context.account,new URL(req.url).searchParams.get("locale")==="en"?"en":"fr");
  await writeApiLog({request:req,statusCode:200,userId:context.auth.session.userId,startedAt,metadata:{organizationId,domain:"physical-count-template"}});
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="DTSC-comptage-physique.xlsx"',"Cache-Control":"private, no-store"}});
}
export async function POST(req:Request,{params}:Params){
  const {organizationId}=await params,startedAt=Date.now(),context=await prepare(req,organizationId,true);
  if("response" in context)return context.response;
  const form=await req.formData().catch(()=>null),file=form?.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"RECONCILIATION_COUNT_ROWS_INVALID"},{status:422});
  try{
    const preview=await parsePhysicalCountXlsx(file,context.account);
    await writeApiLog({request:req,statusCode:200,userId:context.auth.session.userId,startedAt,metadata:{organizationId,domain:"physical-count-preview",lineCount:preview.counts.length}});
    return NextResponse.json(preview,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return financeErrorResponse(error,"RECONCILIATION_COUNT_ROWS_INVALID");}
}
