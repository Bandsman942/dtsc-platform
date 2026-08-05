import { NextResponse } from "next/server";
import { ensureBillingPlans } from "@/lib/billing";

export async function GET() {
  const plans = (await ensureBillingPlans()).filter((plan) => ["PERSONAL", "BOTH"].includes(plan.audience));
  return NextResponse.json({
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      priceUsd: Number(plan.priceUsd),
      dailyMessageLimit: plan.dailyMessageLimit,
      dailyTokenLimit: plan.dailyTokenLimit,
      maxDocuments: plan.maxDocuments,
    })),
  });
}
