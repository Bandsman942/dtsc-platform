import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { reviewCashVariance } from "@/lib/enterprise/accounting/cash-variance-review-service";
import { listCashVarianceCanonicalCandidates } from "@/lib/enterprise/accounting/cash-variance-canonical-service";
import { prisma } from "@/lib/prisma";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

const schema = z.object({
  discrepancyId:z.string().trim().min(1).max(240),
  revision:z.number().int().positive(),
  decision:z.enum(["CORRECT_COUNT","REAL_VARIANCE","REVERSE_REAL","LINK_CANONICAL","UNLINK_CANONICAL"]),
  canonicalTreasuryTransactionId:z.string().trim().min(1).max(240).optional(),
  verifiedCount:z.string().regex(/^\d{1,14}(\.\d{1,6})?$/),
  evidenceReference:z.string().trim().min(3).max(200),
  reason:z.string().trim().min(10).max(1000),
  attest:z.literal(true),
}).refine(value=>value.decision!=="LINK_CANONICAL"||Boolean(value.canonicalTreasuryTransactionId),{path:["canonicalTreasuryTransactionId"],message:"Required"});
type Params = { params: Promise<{organizationId:string;sessionId:string}> };
export async function GET(req:Request,{params}:Params) {
  const startedAt=Date.now();
  const {organizationId,sessionId}=await params;
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_CASH","approve");
  if(!auth.ok)return auth.response;
  if(!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_ACCOUNTING",action:"manage"}))return NextResponse.json({error:"Forbidden"},{status:403});
  if(!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_TREASURY",action:"view"}) || !await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_PAYMENTS",action:"view"}))return NextResponse.json({error:"Forbidden"},{status:403});
  const page=z.coerce.number().int().min(1).max(500).safeParse(new URL(req.url).searchParams.get("page")||1);
  if(!page.success)return financeValidationErrorResponse(page.error);
  try {
    const session=await prisma.enterpriseCashSession.findFirst({where:{organizationId,id:sessionId},select:{siteId:true,cashierUserId:true,validatedByUserId:true}});
    const scope=await retailFinanceReadSiteScope(organizationId,auth.session.userId,"CLOSE_CASH");
    if(!session || session.cashierUserId===auth.session.userId || session.validatedByUserId===auth.session.userId || (scope!==null&&(!session.siteId||!scope.includes(session.siteId))))return NextResponse.json({error:"Forbidden"},{status:403});
    const result=await listCashVarianceCanonicalCandidates(organizationId,sessionId,auth.session.userId,page.data);
    await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"cash-variance-evidence"}});
    return NextResponse.json(result);
  } catch(error){return financeErrorResponse(error,"CASH_VARIANCE_REVIEW_FAILED");}
}
export async function POST(req:Request,{params}:Params) {
  const startedAt=Date.now();
  const {organizationId,sessionId}=await params;
  const auth=await authorizeFinanceRequest(req,organizationId,"FINANCE_CASH","approve",{mutation:true,limit:30});
  if (!auth.ok) return auth.response;
  const parsed=schema.safeParse(await req.json().catch(()=>null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error);
  const accounting=await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_ACCOUNTING",action:parsed.data.decision==="REAL_VARIANCE"?"post":["LINK_CANONICAL","UNLINK_CANONICAL"].includes(parsed.data.decision)?"manage":"reverse"});
  if (!accounting) return NextResponse.json({error:"Forbidden",message:"Permission comptable requise."},{status:403});
  if(["LINK_CANONICAL","UNLINK_CANONICAL"].includes(parsed.data.decision) && (!await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_TREASURY",action:"view"}) || !await getEnterpriseAccountingAccess({session:auth.session,organizationId,moduleCode:"FINANCE_PAYMENTS",action:"view"})))return NextResponse.json({error:"Forbidden"},{status:403});
  if (!(await hasRecentStepUp(auth.session))) {
    await writeAuditLog({userId:auth.session.userId,action:"AUTH_CRITICAL_MUTATION_STEPUP_DENIED",entity:"EnterpriseCashSession",entityId:sessionId,request:req,result:"DENIED",reasonCode:"STEP_UP_REQUIRED",riskLevel:"CRITICAL",metadata:{organizationId}});
    return NextResponse.json({error:"STEP_UP_REQUIRED",message:"Vérification de sécurité récente obligatoire.",reasonCode:"STEP_UP_REQUIRED"},{status:428});
  }
  try {
    const result=await reviewCashVariance(organizationId,sessionId,auth.session.userId,parsed.data);
    await writeAuditLog({userId:auth.session.userId,action:"ENTERPRISE_CASH_VARIANCE_REVIEWED",entity:"EnterpriseCashDiscrepancy",entityId:result.discrepancy.id,request:req,metadata:{organizationId,sessionId,decision:parsed.data.decision,status:result.discrepancy.status}});
    await writeApiLog({request:req,statusCode:200,userId:auth.session.userId,startedAt,metadata:{organizationId,domain:"cash-variance-review"}});
    return NextResponse.json({ok:true,...result});
  } catch(error) {
    if(error && typeof error==="object" && "code" in error){
      const sqlState=(error as {meta?:{code?:unknown}}).meta?.code;
      if(error.code==="P2034" || (error.code==="P2010" && (sqlState==="40001" || sqlState==="40P01")))return NextResponse.json({error:"CASH_VARIANCE_REVIEW_CONFLICT",message:"Actualisez le dossier puis réessayez."},{status:409});
    }
    return financeErrorResponse(error,"CASH_VARIANCE_REVIEW_FAILED");
  }
}
