import { NextResponse } from "next/server";
import { authorizeFinanceRequest,financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { buildBankStatementXlsx,parseBankStatementXlsx } from "@/lib/enterprise/accounting/bank-statement-xlsx";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
type Params={params:Promise<{organizationId:string}>};
export async function GET(req:Request,{params}:Params){
  const startedAt=Date.now(),{organizationId}=await params;
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_BANK","view");
  if(!auth.ok)return auth.response;
  const query=new URL(req.url).searchParams;
  const id=query.get("financialAccountId");
  const account=id?await prisma.enterpriseFinancialAccount.findFirst({where:{organizationId,id,status:"ACTIVE",archivedAt:null,accountType:{in:["BANK","MOBILE_MONEY"]}},select:{code:true,name:true,currencyCode:true,accountType:true}}):null;
  if(id&&!account)return NextResponse.json({error:"BANK_STATEMENT_ACCOUNT_INVALID"},{status:404});
  const bytes=await buildBankStatementXlsx(query.get("locale")==="en"?"en":"fr",account||undefined);
  await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"bank-statement-template",format:"xlsx"}});
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="DTSC-modele-releve.xlsx"',"Cache-Control":"private, no-store"}});
}
export async function POST(req:Request,{params}:Params){
  const startedAt=Date.now(),{organizationId}=await params;
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_BANK","create",{mutation:true,limit:30});
  if(!auth.ok)return auth.response;
  const body=await req.formData().catch(()=>null),file=body?.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"BANK_STATEMENT_FILE_INVALID"},{status:422});
  try{
    const lines=await parseBankStatementXlsx(file);
    await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"bank-statement-preview",lineCount:lines.length}});
    return NextResponse.json({lines},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return financeErrorResponse(error,"BANK_STATEMENT_FILE_INVALID");}
}
