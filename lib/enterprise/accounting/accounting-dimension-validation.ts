import type { PrismaClient } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

type DimensionDb = Pick<
  PrismaClient,
  | "enterpriseBusinessParty"
  | "enterpriseProject"
  | "enterpriseDepartment"
  | "enterpriseSite"
  | "enterpriseAsset"
  | "enterpriseInventoryItem"
>;

export type AccountingDimensionInput = {
  businessPartyId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  siteId?: string | null;
  assetId?: string | null;
  inventoryItemId?: string | null;
};

type DimensionKey = keyof AccountingDimensionInput;

type DimensionReference = {
  key: DimensionKey;
  id: string;
};

function references(lines: AccountingDimensionInput[]) {
  const refs: DimensionReference[] = [];
  for (const line of lines) {
    for (const key of ["businessPartyId", "projectId", "departmentId", "siteId", "assetId", "inventoryItemId"] as const) {
      const id = line[key]?.trim();
      if (id) refs.push({ key, id });
    }
  }
  return refs;
}

function uniqueIds(refs: DimensionReference[], key: DimensionKey) {
  return [...new Set(refs.filter((ref) => ref.key === key).map((ref) => ref.id))];
}

function assertResolved(requested: string[], resolved: string[], errorCode: string) {
  if (!requested.length) return;
  const found = new Set(resolved);
  const invalid = requested.filter((id) => !found.has(id));
  if (invalid.length) {
    throw new EnterpriseAccountingError(errorCode, 409, { count: invalid.length });
  }
}

/**
 * Revalidates every optional analytical dimension of a manual journal entry in
 * the active organization. UI lookups are convenience only; the server is the
 * authorization and tenant-integrity boundary.
 */
export async function validateAccountingDimensions(
  db: DimensionDb,
  organizationId: string,
  lines: AccountingDimensionInput[],
) {
  const refs = references(lines);
  const businessPartyIds = uniqueIds(refs, "businessPartyId");
  const projectIds = uniqueIds(refs, "projectId");
  const departmentIds = uniqueIds(refs, "departmentId");
  const siteIds = uniqueIds(refs, "siteId");
  const assetIds = uniqueIds(refs, "assetId");
  const inventoryItemIds = uniqueIds(refs, "inventoryItemId");

  const [parties, projects, departments, sites, assets, inventoryItems] = await Promise.all([
    businessPartyIds.length
      ? db.enterpriseBusinessParty.findMany({
          where: { organizationId, id: { in: businessPartyIds }, status: "ACTIVE", archivedAt: null },
          select: { id: true },
        })
      : Promise.resolve([]),
    projectIds.length
      ? db.enterpriseProject.findMany({
          where: { organizationId, id: { in: projectIds }, archivedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
          select: { id: true },
        })
      : Promise.resolve([]),
    departmentIds.length
      ? db.enterpriseDepartment.findMany({
          where: { organizationId, id: { in: departmentIds }, isActive: true },
          select: { id: true },
        })
      : Promise.resolve([]),
    siteIds.length
      ? db.enterpriseSite.findMany({
          where: { organizationId, id: { in: siteIds }, status: "ACTIVE", archivedAt: null },
          select: { id: true },
        })
      : Promise.resolve([]),
    assetIds.length
      ? db.enterpriseAsset.findMany({
          where: { organizationId, id: { in: assetIds }, archivedAt: null, status: { notIn: ["DISPOSED", "ARCHIVED", "CANCELLED"] } },
          select: { id: true },
        })
      : Promise.resolve([]),
    inventoryItemIds.length
      ? db.enterpriseInventoryItem.findMany({
          where: { organizationId, id: { in: inventoryItemIds }, status: "ACTIVE", archivedAt: null },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  assertResolved(businessPartyIds, parties.map((item) => item.id), "JOURNAL_BUSINESS_PARTY_INVALID");
  assertResolved(projectIds, projects.map((item) => item.id), "JOURNAL_PROJECT_INVALID");
  assertResolved(departmentIds, departments.map((item) => item.id), "JOURNAL_DEPARTMENT_INVALID");
  assertResolved(siteIds, sites.map((item) => item.id), "JOURNAL_SITE_INVALID");
  assertResolved(assetIds, assets.map((item) => item.id), "JOURNAL_ASSET_INVALID");
  assertResolved(inventoryItemIds, inventoryItems.map((item) => item.id), "JOURNAL_INVENTORY_ITEM_INVALID");
}
