import { NextResponse } from "next/server";
import { getPublishedBillingCatalog } from "@/lib/billing/commercial-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getPublishedBillingCatalog();
  return NextResponse.json(catalog, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
