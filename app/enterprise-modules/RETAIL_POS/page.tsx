import { renderRetailModulePage } from "@/app/enterprise-modules/retail-page";

export default async function RetailPosPage({ searchParams }: { searchParams?: Promise<{ section?: string; siteId?: string }> }) {
  const params = await searchParams;
  return renderRetailModulePage("RETAIL_POS", { section: params?.section, siteId: params?.siteId });
}
