import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSharedCronDispatchPaused } from "@/lib/scheduled-cron-activation";
import { processInventoryQualityAlerts } from "@/lib/enterprise/inventory/quality-alert-worker";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;

function authorize(request:NextRequest){
  const accepted=[process.env.CRON_SECRET,process.env.WORKFLOW_WORKER_SECRET].filter((value):value is string=>Boolean(value));
  const auth=request.headers.get("authorization")||"";
  const presented=Buffer.from(auth.startsWith("Bearer ")?auth.slice(7):"");
  return Boolean(presented.length&&accepted.some(secret=>{const bytes=Buffer.from(secret);return bytes.length===presented.length&&timingSafeEqual(bytes,presented);}));
}
async function handle(request:NextRequest){
  if (!authorize(request)) return NextResponse.json({error:"Unauthorized"},{status:process.env.CRON_SECRET||process.env.WORKFLOW_WORKER_SECRET?401:503});
  if (isSharedCronDispatchPaused(request, "INVENTORY_QUALITY_ALERTS_CRON_ENABLED")) return NextResponse.json({error:"CRON_DISPATCH_DISABLED"},{status:503});
  const value=Number(request.nextUrl.searchParams.get("batch")||8);
  const batchSize=Number.isFinite(value)?Math.max(1,Math.min(20,Math.trunc(value))):8;
  const startedAt=Date.now();
  const result=await processInventoryQualityAlerts({batchSize});
  return NextResponse.json({ok:result.failed===0,durationMs:Date.now()-startedAt,...result},{status:result.failed?503:200});
}
export async function GET(request:NextRequest){return handle(request);}
export async function POST(request:NextRequest){return handle(request);}
