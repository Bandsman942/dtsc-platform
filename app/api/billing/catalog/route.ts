import { NextResponse } from "next/server";
import { getPublishedBillingCatalog } from "@/lib/billing/commercial-catalog";

export async function GET() {
  const catalog = await getPublishedBillingCatalog();
  return NextResponse.json(catalog, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
    },
  });
}
