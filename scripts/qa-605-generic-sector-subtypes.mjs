import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const genericRegistry = read("lib/enterprise/business-subtype-registry.ts");
const retailRegistry = read("lib/enterprise/retail/subtype-registry.ts");
const canonicalTemplateApplication = read("lib/enterprise/sector-template-application.ts");
const sectorTemplateRoute = read("app/api/admin/sector-templates/route.ts");
const createOrganizationRoute = read("app/api/admin/client-organizations/route.ts");
const architectureDoc = read("docs/ERP_SECTOR_SUBTYPE_ARCHITECTURE.md");

check(
  genericRegistry.includes('sectorCode: "COMMERCE_RETAIL"') && genericRegistry.includes('code: "SHOP"'),
  "Generic subtype registry must own COMMERCE_RETAIL -> SHOP classification metadata",
);
check(
  genericRegistry.includes('sectorCode: "MANUFACTURING"') && genericRegistry.includes('code: "TAILORING_APPAREL"'),
  "Generic subtype registry must declare MANUFACTURING -> TAILORING_APPAREL",
);
check(
  genericRegistry.includes('code: "TAILORING_APPAREL"') && genericRegistry.includes('implementationStatus: "PLANNED"'),
  "TAILORING_APPAREL must remain PLANNED during iteration #605",
);
check(
  genericRegistry.includes("listBusinessSubtypesForSector") && genericRegistry.includes("getBusinessSubtypeForSector"),
  "Generic registry must expose sector-scoped subtype resolution",
);
check(
  retailRegistry.includes('@/lib/enterprise/business-subtype-registry'),
  "Retail subtype adapter must consume the generic subtype registry",
);
check(
  retailRegistry.includes("RETAIL_MODULE_CODES"),
  "Retail must retain ownership of Shop module scope",
);
check(
  retailRegistry.includes('RETAIL_BUSINESS_SUBTYPE_CODES = ["SHOP"]'),
  "Retail compatibility contract must remain SHOP-only in iteration #605",
);
check(
  !retailRegistry.includes("tailoring workshop"),
  "Tailoring must no longer be documented as a future Retail subtype",
);
check(
  canonicalTemplateApplication.includes("type BusinessSubtypeCode") && canonicalTemplateApplication.includes("getBusinessSubtypeForSector"),
  "Canonical template application must accept and validate the generic subtype contract",
);
check(
  canonicalTemplateApplication.includes("normalizeRetailBusinessSubtypeCode"),
  "Canonical template application must keep Retail behind a compatibility adapter during cutover",
);
check(
  canonicalTemplateApplication.includes("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH"),
  "Canonical template application must fail closed for an invalid sector/subtype pair",
);
check(
  sectorTemplateRoute.includes("getBusinessSubtypeForSector") && sectorTemplateRoute.includes("listBusinessSubtypesForSector"),
  "Administration template preview must resolve subtype metadata through the generic registry",
);
check(
  sectorTemplateRoute.includes("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH"),
  "Administration template preview must reject an invalid sector/subtype pair with a generic reason code",
);
check(
  sectorTemplateRoute.includes("businessSubtypes"),
  "Administration template preview must expose the active subtype options for the selected sector",
);
check(
  !sectorTemplateRoute.includes("getRetailBusinessSubtype"),
  "Administration template preview must not validate classification through the Retail-only registry",
);
check(
  createOrganizationRoute.includes("getBusinessSubtypeForSector") && createOrganizationRoute.includes("normalizeBusinessSubtypeCode"),
  "Company creation must validate the selected subtype through the generic registry",
);
check(
  createOrganizationRoute.includes("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH"),
  "Company creation must expose a generic invalid sector/subtype reason code",
);
check(
  createOrganizationRoute.includes("RETAIL_BUSINESS_SUBTYPE_INVALID") && createOrganizationRoute.includes("RETAIL_BUSINESS_SUBTYPE_SECTOR_MISMATCH"),
  "Company creation must preserve Retail reason-code compatibility during the cutover",
);
check(
  createOrganizationRoute.includes("normalizeRetailBusinessSubtypeCode(businessSubtypeCode)"),
  "Retail provisioning must remain behind its compatibility adapter during the generic cutover",
);
check(
  architectureDoc.includes("TAILORING_APPAREL") && architectureDoc.includes("PLANNED"),
  "Architecture documentation must keep Tailoring planned until Manufacturing is implemented",
);
check(
  architectureDoc.includes("Aucune donnée n’est migrée dans cette slice"),
  "Slice A rollback/data boundary must be documented",
);

if (failures.length) {
  console.error(`qa-605-generic-sector-subtypes: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("qa-605-generic-sector-subtypes: OK");
