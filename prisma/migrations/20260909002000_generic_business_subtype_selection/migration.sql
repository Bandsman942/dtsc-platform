-- Iteration #605: persist the organization sector/sub-sector decision in a generic table.
-- The code registry remains the authority for which sector/sub-sector pairs are valid.
-- organizationId integrity is enforced by tenant-scoped application validation; no
-- hidden Prisma relation is introduced because the multi-file model intentionally
-- keeps this classification record independent from the large Organization model.

CREATE TABLE "EnterpriseBusinessSubtypeSelection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sectorCode" TEXT NOT NULL,
    "businessSubtypeCode" TEXT,
    "selectionVersion" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'DTSC_ADMIN',
    "selectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseBusinessSubtypeSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseBusinessSubtypeSelection_organizationId_key"
    ON "EnterpriseBusinessSubtypeSelection"("organizationId");

CREATE INDEX "EnterpriseBusinessSubtypeSelection_sectorCode_businessSubtypeCode_idx"
    ON "EnterpriseBusinessSubtypeSelection"("sectorCode", "businessSubtypeCode");

CREATE INDEX "EnterpriseBusinessSubtypeSelection_selectedByUserId_updatedAt_idx"
    ON "EnterpriseBusinessSubtypeSelection"("selectedByUserId", "updatedAt");

-- Cut over existing organizations without changing their effective behavior.
-- Retail configurations created after hotfix #512 already carry an explicit marker.
-- Older Retail organizations intentionally remain interpreted as SHOP.
INSERT INTO "EnterpriseBusinessSubtypeSelection" (
    "id",
    "organizationId",
    "sectorCode",
    "businessSubtypeCode",
    "selectionVersion",
    "source",
    "createdAt",
    "updatedAt"
)
SELECT
    'subtype-' || md5(o."id"),
    o."id",
    o."sectorCode",
    CASE
        WHEN o."sectorCode" = 'COMMERCE_RETAIL' THEN
            CASE
                WHEN rc."settingsJson" ->> 'businessSubtypeSelectionVersion' = '1' THEN
                    CASE
                        WHEN rc."settingsJson" ->> 'businessSubtypeCode' = 'SHOP' THEN 'SHOP'
                        ELSE NULL
                    END
                ELSE 'SHOP'
            END
        ELSE NULL
    END,
    1,
    'MIGRATION_605',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" o
LEFT JOIN "EnterpriseRetailConfiguration" rc
    ON rc."organizationId" = o."id"
WHERE o."sectorCode" IS NOT NULL
ON CONFLICT ("organizationId") DO NOTHING;
