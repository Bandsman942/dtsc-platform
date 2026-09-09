import { BUSINESS_SUBTYPES, normalizeBusinessSubtypeCode } from "@/lib/enterprise/business-subtype-registry";
import { RETAIL_MODULE_CODES, RETAIL_SECTOR_CODE, type RetailModuleCode } from "@/lib/enterprise/retail/constants";

export const RETAIL_BUSINESS_SUBTYPE_CODES = ["SHOP"] as const;
export type RetailBusinessSubtypeCode = (typeof RETAIL_BUSINESS_SUBTYPE_CODES)[number];

export type RetailBusinessSubtypeDefinition = {
  code: RetailBusinessSubtypeCode;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  moduleCodes: readonly RetailModuleCode[];
};

const SHOP_BUSINESS_SUBTYPE = BUSINESS_SUBTYPES.find(
  (subtype) => subtype.sectorCode === RETAIL_SECTOR_CODE && subtype.code === "SHOP",
)!;

/**
 * Retail compatibility adapter over the canonical cross-sector subtype registry.
 *
 * Classification metadata is owned by `business-subtype-registry.ts`; Retail keeps
 * ownership of the Shop module scope and historical runtime compatibility contract.
 */
export const RETAIL_BUSINESS_SUBTYPES: readonly RetailBusinessSubtypeDefinition[] = [
  {
    code: "SHOP",
    labelFr: SHOP_BUSINESS_SUBTYPE.labelFr,
    labelEn: SHOP_BUSINESS_SUBTYPE.labelEn,
    descriptionFr: SHOP_BUSINESS_SUBTYPE.descriptionFr,
    descriptionEn: SHOP_BUSINESS_SUBTYPE.descriptionEn,
    // Preserve the existing Shop surface exactly. Mobile Money and Telco remain
    // optional at runtime through module enablement, entitlement and provider setup.
    moduleCodes: RETAIL_MODULE_CODES,
  },
] as const;

const RETAIL_SUBTYPE_SCOPED_MODULE_CODES = new Set<string>(
  RETAIL_BUSINESS_SUBTYPES.flatMap((subtype) => [...subtype.moduleCodes]),
);

export function listRetailBusinessSubtypes() {
  return RETAIL_BUSINESS_SUBTYPES;
}

export function isRetailBusinessSubtypeCode(value: string | null | undefined): value is RetailBusinessSubtypeCode {
  const normalized = normalizeBusinessSubtypeCode(value);
  return normalized === "SHOP";
}

export function normalizeRetailBusinessSubtypeCode(value: string | null | undefined): RetailBusinessSubtypeCode | null {
  const normalized = normalizeBusinessSubtypeCode(value);
  return normalized === "SHOP" ? normalized : null;
}

export function getRetailBusinessSubtype(value: string | null | undefined) {
  const code = normalizeRetailBusinessSubtypeCode(value);
  return code ? RETAIL_BUSINESS_SUBTYPES.find((subtype) => subtype.code === code) || null : null;
}

export function isRetailSubtypeScopedModule(moduleCode: string) {
  return RETAIL_SUBTYPE_SCOPED_MODULE_CODES.has(moduleCode);
}

export function retailSubtypeAllowsModule(moduleCode: string, subtypeCode: string | null | undefined) {
  if (!isRetailSubtypeScopedModule(moduleCode)) {
    return true;
  }
  const subtype = getRetailBusinessSubtype(subtypeCode);
  return subtype?.moduleCodes.includes(moduleCode as RetailModuleCode) ?? false;
}

export function retailSubtypeLabel(subtypeCode: string | null | undefined, locale: "fr" | "en" = "fr") {
  const subtype = getRetailBusinessSubtype(subtypeCode);
  if (!subtype) {
    return locale === "en" ? "General retail" : "Commerce retail général";
  }
  return locale === "en" ? subtype.labelEn : subtype.labelFr;
}
