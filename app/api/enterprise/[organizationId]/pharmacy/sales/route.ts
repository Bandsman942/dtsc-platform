import { NextResponse } from "next/server";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { getSession } from "@/lib/auth"; import { writeApiLog, writeAuditLog } from "@/lib/audit"; import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access"; import { pharmacySaleSchema } from "@/lib/pharmacy-sale-validators"; import { createSale, getSalesDataset, validateSaleReferences } from "@/lib/pharmacy-sales"; import { getRateLimitKey, rateLimit } from "@/lib/rate-limit"; import { isSameOriginRequest } from "@/lib/request-security";
type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacySales(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.min(100_000, Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "12", 10) || 12));
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const allowedViews = ["dashboard", "today", "history", "lines", "validation", "refunds", "exceptional", "receipts", "anomalies", "movements"] as const;
  const requestedView = url.searchParams.get("view");
  const view = allowedViews.find((candidate) => candidate === requestedView) || "dashboard";
  try {
    const data = await getSalesDataset(organizationId, { page, pageSize, query, view });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json(data);
  } catch (error) {
    const response = enterpriseDomainErrorResponse(error, "PHARMACY_SALES_READ_FAILED", req);
    await writeApiLog({ request: req, statusCode: response.status, userId: session.userId, startedAt });
    return response;
  }
}
export async function POST(req: Request, { params }: Params) { const startedAt=Date.now(); if(!isSameOriginRequest(req))return NextResponse.json({error:"Forbidden"},{status:403}); const session=await getSession(); if(!session)return NextResponse.json({error:"Unauthorized"},{status:401}); const limited=await rateLimit(getRateLimitKey(req,`pharmacy-sales:${session.userId}`),100,3600000); if(!limited.ok)return NextResponse.json({error:"Too many requests",message:"Trop d'actions de vente."},{status:429}); const {organizationId}=await params; if(!(await canAccessPharmacySales(session.userId,organizationId,"create")))return NextResponse.json({error:"Forbidden"},{status:403}); const parsed=pharmacySaleSchema.safeParse(await req.json().catch(()=>null)); if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "PHARMACY_SALE_INPUT_INVALID", req); const referenceError=await validateSaleReferences(organizationId,parsed.data); if(referenceError)return NextResponse.json({error:"Invalid reference",message:referenceError},{status:400}); const sale=await createSale(organizationId,session.userId,parsed.data); await writeAuditLog({userId:session.userId,action:"PHARMACY_SALE_CREATED",entity:"PharmacySale",entityId:sale.id,request:req,metadata:{organizationId}}); await writeApiLog({request:req,statusCode:201,userId:session.userId,startedAt}); return NextResponse.json({ok:true,sale},{status:201}); }
