import { prisma } from "@/lib/prisma";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

/**
 * Convert user-entered calendar dates to the tenant's IANA timezone boundaries.
 * The end of the period is exclusive and calculated at the NEXT local midnight.
 * A "day" can contain 23, 24 or 25 hours; never add 86_400_000 milliseconds.
 */
export async function readRetailListDateRange(req: Request, organizationId: string) {
  const params = new URL(req.url).searchParams;
  const fromLabel = (params.get("from") || "").trim();
  const toLabel = (params.get("to") || "").trim();
  if ((fromLabel && !isCivilDate(fromLabel)) || (toLabel && !isCivilDate(toLabel))
    || (fromLabel && toLabel && fromLabel > toLabel)) {
    throw new EnterpriseRetailError("RETAIL_DATE_RANGE_INVALID", 400);
  }
  if (!fromLabel && !toLabel) return { from: null, toExclusive: null, timezone: null };
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null },
    select: { timezone: true },
  });
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);
  const timezone = organization.timezone || "UTC";
  return {
    from: fromLabel ? civilMidnightUtc(fromLabel, timezone) : null,
    toExclusive: toLabel ? civilMidnightUtc(followingCivilDate(toLabel), timezone) : null,
    timezone,
  };
}
