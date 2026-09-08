import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getSectorTemplatePreview } from "@/lib/enterprise-sector-templates";
import {
  getBusinessSubtypeForSector,
  listBusinessSubtypesForSector,
} from "@/lib/enterprise/business-subtype-registry";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { normalizeRetailBusinessSubtypeCode } from "@/lib/enterprise/retail/subtype-registry";
import { canManageClientOrganizations } from "@/lib/organizations";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageClientOrganizations(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const sectorId = searchParams.get("sectorId") || searchParams.get("sectorCode") || "";
  if (!sectorId) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Missing sector" }, { status: 400 });
  }

  const basePreview = await getSectorTemplatePreview(sectorId);
  if (!basePreview) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestedSubtype = searchParams.get("businessSubtypeCode")?.trim() || "";
  const businessSubtype = requestedSubtype
    ? getBusinessSubtypeForSector(basePreview.sector.code, requestedSubtype)
    : null;
  if (requestedSubtype && !businessSubtype) {
    await writeApiLog({
      request: req,
      statusCode: 400,
      userId: session.userId,
      startedAt,
      metadata: {
        action: "sector_template_invalid_business_subtype",
        sectorCode: basePreview.sector.code,
      },
    });
    return NextResponse.json({
      error: "Invalid business subtype",
      message: "Le sous-secteur sélectionné n’est pas disponible pour ce secteur.",
      reasonCode: "BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH",
    }, { status: 400 });
  }

  // Retail keeps its historical module-scope adapter during the generic cutover.
  // Other sectors receive no active subtype until their runtime contract is implemented.
  const retailBusinessSubtypeCode = basePreview.sector.code === RETAIL_SECTOR_CODE
    ? normalizeRetailBusinessSubtypeCode(businessSubtype?.code || null)
    : null;
  const preview = await getSectorTemplatePreview(sectorId, { businessSubtypeCode: retailBusinessSubtypeCode });
  if (!preview) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const businessSubtypes = listBusinessSubtypesForSector(preview.sector.code).map((subtype) => ({
    code: subtype.code,
    labelFr: subtype.labelFr,
    labelEn: subtype.labelEn,
    descriptionFr: subtype.descriptionFr,
    descriptionEn: subtype.descriptionEn,
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ preview, businessSubtypes });
}
