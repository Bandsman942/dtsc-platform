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
  cashTenderedDefault: z.enum(["TOTAL", "EMPTY"]).default("TOTAL"),
  stockReportEnabled: z.boolean().default(true),
  stockReportIncludeZeroMovement: z.boolean().default(true),
  stockReportIncludeReserved: z.boolean().default(true),
  stockReportIncludeLots: z.boolean().default(false),
  stockReportIncludeExpiry: z.boolean().default(false),
  stockReportDefaultFormat: z.enum(["PDF", "XLSX", "CSV"]).default("PDF"),
  siteTradeName: z.string().trim().max(160).default(""),
  sitePhone: z.string().trim().max(60).default(""),
  siteEmail: z.string().trim().max(150).default(""),
  siteAddress: z.string().trim().max(320).default(""),
}).strict();

export type RetailOperatingSettings = z.infer<typeof retailOperatingSettingsSchema>;
export const DEFAULT_RETAIL_OPERATING_SETTINGS: RetailOperatingSettings = {
  directCheckoutEnabled: false,
  quickPrintEnabled: false,
  simplifiedNavigationEnabled: false,
  defaultPaper: "THERMAL_80MM",
  footerLinesFr: [],
  footerLinesEn: [],
  cashTenderedDefault: "TOTAL",
  stockReportEnabled: true,
  stockReportIncludeZeroMovement: true,
  stockReportIncludeReserved: true,
  stockReportIncludeLots: false,
  stockReportIncludeExpiry: false,
  stockReportDefaultFormat: "PDF",
  siteTradeName: "", sitePhone: "", siteEmail: "", siteAddress: "",
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

/** The registered legal entity is company-scoped. Site overrides can change
 * contact/branding only; they never create a new legal issuer. */
export const retailLegalIdentitySchema = z.object({
  legalName: z.string().trim().max(180).default(""),
  tradeName: z.string().trim().max(180).default(""),
  rccm: z.string().trim().max(100).default(""),
  idNat: z.string().trim().max(100).default(""),
  nif: z.string().trim().max(100).default(""),
  address: z.string().trim().max(320).default(""),
  phone: z.string().trim().max(60).default(""),
  email: z.string().trim().max(150).default(""),
  website: z.string().trim().max(180).default(""),
}).strict();
export type RetailLegalIdentity = z.infer<typeof retailLegalIdentitySchema>;

export function readRetailLegalIdentity(value: unknown): RetailLegalIdentity {
  const root = asRecord(value);
  const parsed = retailLegalIdentitySchema.safeParse(root.retailLegalIdentity ?? {});
  if (!parsed.success) throw new EnterpriseRetailError("RETAIL_OPERATING_SETTINGS_INVALID", 409);
  return parsed.data;
}

export function mergeRetailLegalIdentity(value: unknown, identity: RetailLegalIdentity): Prisma.InputJsonValue {
  return { ...asRecord(value), retailLegalIdentity: retailLegalIdentitySchema.parse(identity) } as Prisma.InputJsonValue;
}

export const retailInvoiceHeaderSchema = z.object({
  legalName: z.string().max(180), tradeName: z.string().max(180),
  phone: z.string().max(60), email: z.string().max(150),
  address: z.string().max(320), website: z.string().max(180),
  rccm: z.string().max(100), idNat: z.string().max(100), nif: z.string().max(100),
}).strict();
export type RetailInvoiceHeader = z.infer<typeof retailInvoiceHeaderSchema>;

/** Freeze the legal identity and local contact data at invoice preparation. */
export function retailInvoiceHeaderSnapshot(
  value: unknown, siteId: string,
  organization: { name: string; phone?: string | null; email?: string | null; address?: string | null },
  site: { name: string; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; countryCode?: string | null },
): Prisma.InputJsonValue {
  const legal = readRetailLegalIdentity(value);
  const store = readRetailOperatingSettings(value, siteId);
  const localAddress = [site.addressLine1, site.addressLine2, site.city, site.countryCode].filter(Boolean).join(", ");
  return retailInvoiceHeaderSchema.parse({
    legalName: legal.legalName || organization.name,
    tradeName: store.siteTradeName || legal.tradeName || site.name,
    phone: store.sitePhone || legal.phone || organization.phone || "",
    email: store.siteEmail || legal.email || organization.email || "",
    address: store.siteAddress || localAddress || legal.address || organization.address || "",
    website: legal.website, rccm: legal.rccm, idNat: legal.idNat, nif: legal.nif,
  }) as Prisma.InputJsonValue;
}

export function readRetailInvoiceHeaderSnapshot(value: unknown): RetailInvoiceHeader | null {
  const parsed = retailInvoiceHeaderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
