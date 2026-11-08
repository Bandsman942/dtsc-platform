import { renderRetailModulePage } from "@/app/enterprise-modules/retail-page";

export default async function RetailDailyClosePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const params = await searchParams;
  return renderRetailModulePage("RETAIL_DAILY_CLOSE", { siteId: params.siteId });
}
