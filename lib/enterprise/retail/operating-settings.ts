import { Prisma } from "@prisma/client";
import { z } from "zod";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

export const retailOperatingSettingsSchema = z.object({
  directCheckoutEnabled: z.boolean(),
  quickPrintEnabled: z.boolean(),
  simplifiedNavigationEnabled: z.boolean(),
  defaultPaper: z.enum(["THERMAL_80MM", "A4"]),
  footerLinesFr: z.array(z.string().trim().min(1).max(300)).max(4),
  footerLinesEn: z.array(z.string().trim().min(1).max(300)).max(4),
}).strict();

export type RetailOperatingSettings = z.infer<typeof retailOperatingSettingsSchema>;
export const DEFAULT_RETAIL_OPERATING_SETTINGS: RetailOperatingSettings = {
  directCheckoutEnabled: false,
  quickPrintEnabled: false,
  simplifiedNavigationEnabled: false,
  defaultPaper: "THERMAL_80MM",
  footerLinesFr: [],
  footerLinesEn: [],
};
const partialSchema = retailOperatingSettingsSchema.partial();
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function readRetailOperatingSettings(value: unknown, siteId?: string | null): RetailOperatingSettings {
  const settings = asRecord(value);
  const root = partialSchema.safeParse(settings.retailOperatingSettings ?? {});
  if (!root.success) throw new EnterpriseRetailError("RETAIL_OPERATING_SETTINGS_INVALID", 409);
  const overrides = asRecord(settings.retailSiteOperatingOverrides);
  const site = siteId ? partialSchema.safeParse(overrides[siteId] ?? {}) : partialSchema.safeParse({});
  if (!site.success) throw new EnterpriseRetailError("RETAIL_OPERATING_SETTINGS_INVALID", 409);
  return retailOperatingSettingsSchema.parse({ ...DEFAULT_RETAIL_OPERATING_SETTINGS, ...root.data, ...site.data });
}

export function mergeRetailOperatingSettings(
  existing: unknown, value: RetailOperatingSettings, siteId?: string | null,
): Prisma.InputJsonValue {
  const settings = asRecord(existing);
  const parsed = retailOperatingSettingsSchema.parse(value);
  if (!siteId) return { ...settings, retailOperatingSettings: parsed } as Prisma.InputJsonValue;
  // Persist only fields that differ from the company defaults. This keeps
  // untouched store settings inherited across later company-level edits.
  const inherited = readRetailOperatingSettings(settings);
  const overrides = { ...asRecord(settings.retailSiteOperatingOverrides) };
  const difference = Object.fromEntries(
    Object.entries(parsed).filter(([key, val]) =>
      JSON.stringify(val) !== JSON.stringify(inherited[key as keyof RetailOperatingSettings])),
  );
  if (Object.keys(difference).length) overrides[siteId] = difference;
  else delete overrides[siteId];
  return { ...settings, retailSiteOperatingOverrides: overrides } as Prisma.InputJsonValue;
}

export function retailInvoiceFooterSnapshot(value: unknown, siteId: string): Prisma.InputJsonValue {
  const settings = readRetailOperatingSettings(value, siteId);
  return { fr: settings.footerLinesFr, en: settings.footerLinesEn } as Prisma.InputJsonValue;
}

export function readRetailInvoiceFooterSnapshot(value: unknown, locale: "fr" | "en"): string[] {
  const snapshot = asRecord(value)[locale];
  return Array.isArray(snapshot) ? snapshot.filter((line): line is string =>
    typeof line === "string" && line.trim().length > 0 && line.length <= 300).slice(0, 4) : [];
}
