import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSharedCronDispatchPaused } from "@/lib/scheduled-cron-activation";
import { processInventoryQualityAlerts } from "@/lib/enterprise/inventory/quality-alert-worker";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;

async function handle(request:NextRequest){
  const accepted=[process.env.CRON_SECRET,process.env.WORKFLOW_WORKER_SECRET].filter((value):value is string=>Boolean(value));
  if(!accepted.length)return NextResponse.json({error:"WORKER_NOT_CONFIGURED"},{status:503});
  const auth=request.headers.get("authorization")||"";
  const presented=Buffer.from(auth.startsWith("Bearer ")?auth.slice(7):"");
  if(!presented.length||!accepted.some(secret=>{const bytes=Buffer.from(secret);return bytes.length===presented.length&&timingSafeEqual(bytes,presented);}))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(isSharedCronDispatchPaused(request,"INVENTORY_QUALITY_ALERTS_CRON_ENABLED"))return NextResponse.json({error:"CRON_DISPATCH_DISABLED"},{status:503});
  const value=Number(request.nextUrl.searchParams.get("batch")||8);
  const batchSize=Number.isFinite(value)?Math.max(1,Math.min(20,Math.trunc(value))):8;
  const startedAt=Date.now();
  const result=await processInventoryQualityAlerts({batchSize});
  return NextResponse.json({ok:result.failed===0,durationMs:Date.now()-startedAt,...result},{status:result.failed?503:200});
}
export async function GET(request:NextRequest){return handle(request);}
export async function POST(request:NextRequest){return handle(request);}
