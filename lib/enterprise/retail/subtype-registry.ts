import { RETAIL_MODULE_CODES, type RetailModuleCode } from "@/lib/enterprise/retail/constants";

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

/**
 * Canonical retail business-subtype registry.
 *
 * `COMMERCE_RETAIL` remains the generic sector. A subtype only adds the modules
 * listed here on top of the generic retail template. Future retail businesses
 * (fashion shop, hair salon, tailoring workshop, etc.) must be registered here
 * instead of adding one-off conditions to the company creation form.
 */
export const RETAIL_BUSINESS_SUBTYPES: readonly RetailBusinessSubtypeDefinition[] = [
  {
    code: "SHOP",
    labelFr: "Shop",
    labelEn: "Shop",
    descriptionFr: "Commerce de détail avec point de vente, clôture Retail et extensions opérateur déjà disponibles dans DTSC Platform.",
    descriptionEn: "Retail shop with point of sale, Retail close and operator extensions already available in DTSC Platform.",
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
  return Boolean(value && RETAIL_BUSINESS_SUBTYPE_CODES.includes(value as RetailBusinessSubtypeCode));
}

export function normalizeRetailBusinessSubtypeCode(value: string | null | undefined): RetailBusinessSubtypeCode | null {
  const normalized = value?.trim().toUpperCase() || "";
  return isRetailBusinessSubtypeCode(normalized) ? normalized : null;
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
