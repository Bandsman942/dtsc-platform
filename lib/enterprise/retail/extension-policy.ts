import type { Prisma } from "@prisma/client";

/**
 * RETAIL_CORE is the sector's common operational baseline. Telco and Mobile
 * Money are optional, independent extensions, never implied by a generic
 * COMMERCE_RETAIL selection or a Business-level subscription.
 */
export const RETAIL_CORE_MODULE_CODES = ["RETAIL_POS", "RETAIL_DAILY_CLOSE"] as const;
export const RETAIL_OPTIONAL_EXTENSION_MODULE_CODES = ["MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"] as const;
export type RetailOptionalExtensionModuleCode = (typeof RETAIL_OPTIONAL_EXTENSION_MODULE_CODES)[number];

export function isRetailOptionalExtensionModule(code: string): code is RetailOptionalExtensionModuleCode {
  return RETAIL_OPTIONAL_EXTENSION_MODULE_CODES.some((item) => item === code.trim().toUpperCase());
}

export type RetailExtensionPreferences = Partial<Record<RetailOptionalExtensionModuleCode, boolean>>;
const SETTINGS_KEY = "optionalRetailModules";

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

export function getRetailExtensionPreferences(value: Prisma.JsonValue | null | undefined): RetailExtensionPreferences {
  const raw = objectValue(objectValue(value)[SETTINGS_KEY]);
  const next: RetailExtensionPreferences = {};
  for (const code of RETAIL_OPTIONAL_EXTENSION_MODULE_CODES) {
    if (typeof raw[code] === "boolean") next[code] = raw[code];
  }
  return next;
}

/** Undefined is deliberate: preserve the already configured module state for historical tenants. */
export function getRetailExtensionPreference(
  value: Prisma.JsonValue | null | undefined,
  moduleCode: string,
): boolean | undefined {
  if (!isRetailOptionalExtensionModule(moduleCode)) return undefined;
  return getRetailExtensionPreferences(value)[moduleCode];
}

export function withRetailExtensionPreference(
  settings: Prisma.JsonValue | null | undefined,
  code: RetailOptionalExtensionModuleCode,
  enabled: boolean,
): Prisma.JsonObject {
  const base = objectValue(settings);
  return {
    ...base,
    [SETTINGS_KEY]: { ...getRetailExtensionPreferences(settings), [code]: enabled },
  } as Prisma.JsonObject;
}

export function initialRetailExtensionSettings(
  settings: Prisma.JsonValue | null | undefined,
  genericRetail: boolean,
): Prisma.JsonObject {
  const base = objectValue(settings);
  if (!genericRetail) return { ...base } as Prisma.JsonObject;
  // Only new generic RETAIL_CORE companies default to no specialized packs.
  return {
    ...base,
    [SETTINGS_KEY]: {
      ...getRetailExtensionPreferences(settings),
      MOBILE_MONEY_AGENCY: false,
      TELCO_TOPUPS: false,
    },
  } as Prisma.JsonObject;
}

/**
 * Reconciliation MUST NOT turn a manually disabled extension back on during a
 * plan renewal or upgrade. With no explicit preference, the existing tenant
 * module row is the compatibility authority (no silent migration of Shop).
 */
export function retailExtensionShouldBeEnabled(
  settings: Prisma.JsonValue | null | undefined,
  moduleCode: string,
  existingEnabled: boolean,
): boolean {
  if (!isRetailOptionalExtensionModule(moduleCode)) return true;
  return getRetailExtensionPreference(settings, moduleCode) ?? existingEnabled;
}
