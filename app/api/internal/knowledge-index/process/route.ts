import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { KNOWLEDGE_INDEX_QUEUE_LIMITS } from "@/lib/knowledge-index/constants";
import { processPendingKnowledgeIndexJobs } from "@/lib/knowledge-index/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(left: string, right: string) { const a=Buffer.from(left), b=Buffer.from(right); return a.length===b.length && timingSafeEqual(a,b); }
function authorize(request: NextRequest) {
  const accepted = [process.env.CRON_SECRET, process.env.WORKFLOW_WORKER_SECRET, process.env.KNOWLEDGE_INDEX_WORKER_SECRET].filter((value): value is string => Boolean(value));
  if (!accepted.length) return { ok:false, status:503, message:"Knowledge index worker is not configured." };
  const authorization=request.headers.get("authorization")||""; const presented=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  if (!presented || !accepted.some((secret)=>safeEqual(presented,secret))) return { ok:false, status:401, message:"Unauthorized." };
  return { ok:true, status:200, message:"OK" };
}
async function handle(request: NextRequest) {
  const auth=authorize(request); if(!auth.ok) return NextResponse.json({error:auth.message},{status:auth.status});
  const requested=Number(request.nextUrl.searchParams.get("batch")||KNOWLEDGE_INDEX_QUEUE_LIMITS.workerBatchSize);
  const batchSize=Number.isFinite(requested)?Math.max(1,Math.min(Math.trunc(requested),KNOWLEDGE_INDEX_QUEUE_LIMITS.workerBatchSize)):KNOWLEDGE_INDEX_QUEUE_LIMITS.workerBatchSize;
  const startedAt=Date.now(); const result=await processPendingKnowledgeIndexJobs({batchSize});
  return NextResponse.json({ok:true,durationMs:Date.now()-startedAt,claimed:result.claimed,processed:result.processed,failed:result.failed,dead:result.dead,recovered:result.recovered,orphaned:result.orphaned,queueBefore:result.queueBefore,queueAfter:result.queueAfter,saturated:result.saturated});
}
export async function GET(request:NextRequest){return handle(request)}
export async function POST(request:NextRequest){return handle(request)}
