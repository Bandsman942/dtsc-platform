import { NextResponse } from "next/server";
import { getBusinessSubtypeSelection } from "@/lib/enterprise/business-subtype-selection";

/** The Retail daily close is universal; old Shop history tools are SHOP-only. */
export async function hasShopHistoricalImportAccess(organizationId: string) {
  const selection = await getBusinessSubtypeSelection(organizationId);
  return selection?.sectorCode === "COMMERCE_RETAIL" && selection.businessSubtypeCode === "SHOP";
}

export async function shopHistoricalImportDenial(organizationId: string) {
  return (await hasShopHistoricalImportAccess(organizationId))
    ? null
    : NextResponse.json({
        error: "RETAIL_SHOP_SUBTYPE_REQUIRED",
        message: "La reprise historique est réservée aux entreprises du sous-secteur SHOP.",
      }, { status: 403 });
}
