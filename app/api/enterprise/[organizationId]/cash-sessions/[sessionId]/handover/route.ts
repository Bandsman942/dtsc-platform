import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeApiLog,writeAuditLog } from "@/lib/audit";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { authorizeFinanceRequest,financeErrorResponse,financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { changeCashHandover } from "@/lib/enterprise/accounting/cash-handover-service";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
const reason=z.string().trim().min(4).max(500);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("PROPOSE"),targetSessionId:z.string().min(1).max(240),amount:z.string().regex(/^\d{1,14}(\.\d{1,6})?$/),reason,idempotencyKey:z.string().uuid(),attest:z.literal(true)}),
  z.object({action:z.enum(["ACCEPT","DECLINE","CANCEL"]),handoverId:z.string().min(1).max(240),revision:z.number().int().positive(),reason,attest:z.literal(true)}),
]);
type Params={params:Promise<{organizationId:string;sessionId:string}>};
export async function GET(req:Request,{params}:Params){
  const startedAt=Date.now(),{organizationId,sessionId}=await params;
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_CASH","view");if(!auth.ok)return auth.response;
  const session=await prisma.enterpriseCashSession.findFirst({where:{organizationId,id:sessionId,cashierUserId:auth.session.userId}});
  if(!session)return NextResponse.json({error:"Forbidden"},{status:403});
  const scope=await retailFinanceReadSiteScope(organizationId,auth.session.userId,"CLOSE_CASH");
  if(scope!==null&&(!session.siteId||!scope.includes(session.siteId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const page=Math.max(1,Math.min(10000,Number(new URL(req.url).searchParams.get("page"))||1));
  const where={organizationId,OR:[{sourceSessionId:sessionId},{targetSessionId:sessionId}]};
  const [total,rows,candidates]=await Promise.all([
    prisma.enterpriseCashHandover.count({where}),
    prisma.enterpriseCashHandover.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(Math.floor(page)-1)*20,take:20,include:{sourceSession:{select:{number:true,cashierUserId:true}},targetSession:{select:{number:true,cashierUserId:true}}}}),
    session.status==="OPEN"&&auth.access.capabilities.canManage?prisma.enterpriseCashSession.findMany({where:{organizationId,financialAccountId:session.financialAccountId,siteId:session.siteId,status:"OPEN",cashierUserId:{not:auth.session.userId}},select:{id:true,number:true,cashierUserId:true},take:100,orderBy:{openedAt:"desc"}}):Promise.resolve([]),
  ]);
  const memberIds=[...new Set([...rows.flatMap(r=>[r.sourceSession.cashierUserId,r.targetSession.cashierUserId]),...candidates.map(c=>c.cashierUserId)])];
  const members=await prisma.organizationMember.findMany({where:{organizationId,userId:{in:memberIds}},select:{userId:true,user:{select:{name:true,email:true}}}});
  const labels=new Map(members.map(m=>[m.userId,m.user.name||m.user.email||"—"]));
  await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"cash-handover"}});
  return NextResponse.json({items:rows.map(r=>({id:r.id,revision:r.revision,amount:r.amount.toFixed(),currencyCode:r.currencyCode,status:r.status,reason:r.reason,source:r.sourceSession.number,target:r.targetSession.number,sourceLabel:labels.get(r.sourceSession.cashierUserId)||"—",targetLabel:labels.get(r.targetSession.cashierUserId)||"—",incoming:r.targetSessionId===sessionId,canDecide:auth.access.capabilities.canManage&&r.status==="PENDING",createdAt:r.createdAt})),candidates:candidates.map(c=>({id:c.id,label:c.number+" · "+(labels.get(c.cashierUserId)||"—")})),page:Math.floor(page),pageCount:Math.max(1,Math.ceil(total/20))},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(req:Request,{params}:Params){
  const startedAt=Date.now(),{organizationId,sessionId}=await params;
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_CASH","manage",{mutation:true,limit:30});if(!auth.ok)return auth.response;
  const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return financeValidationErrorResponse(parsed.error);
  if(!await hasRecentStepUp(auth.session))return NextResponse.json({error:"STEP_UP_REQUIRED",message:"Vérification de sécurité récente obligatoire."},{status:428});
  try{
    const result=await changeCashHandover(organizationId,sessionId,auth.session.userId,parsed.data);
    await writeAuditLog({userId:auth.session.userId,action:"ENTERPRISE_CASH_HANDOVER_"+parsed.data.action,entity:"EnterpriseCashHandover",entityId:result.id,request:req,metadata:{organizationId,sessionId,status:result.status}});
    await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"cash-handover"}});
    return NextResponse.json({ok:true,id:result.id,status:result.status});
  }catch(error){return financeErrorResponse(error,"CASH_HANDOVER_FAILED");}
}
