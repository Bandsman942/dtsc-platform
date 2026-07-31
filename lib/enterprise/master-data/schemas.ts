import { z } from "zod";
import { BUSINESS_PARTY_ROLES, BUSINESS_PARTY_TYPES, CATALOG_ITEM_TYPES, SITE_TYPES } from "@/lib/enterprise/master-data/constants";

const optionalText = z.string().trim().max(500).optional().nullable();

export const businessPartyContactSchema = z.object({
  contactType: z.enum(["EMAIL", "PHONE", "MOBILE", "WHATSAPP", "OTHER"]),
  label: z.string().trim().max(80).optional().nullable(),
  value: z.string().trim().min(2).max(200),
  isPrimary: z.boolean().default(false),
});

export const businessPartyAddressSchema = z.object({
  addressType: z.enum(["PRIMARY", "BILLING", "SHIPPING", "WORK", "HOME", "OTHER"]).default("PRIMARY"),
  label: z.string().trim().max(80).optional().nullable(),
  line1: z.string().trim().min(2).max(250),
  line2: z.string().trim().max(250).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  stateProvince: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(40).optional().nullable(),
  countryCode: z.string().trim().toUpperCase().max(3).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const businessPartyCreateSchema = z.object({
  partyType: z.enum(BUSINESS_PARTY_TYPES),
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().max(240).optional().nullable(),
  taxIdentifier: z.string().trim().max(120).optional().nullable(),
  registrationId: z.string().trim().max(120).optional().nullable(),
  primaryEmail: z.string().trim().email().max(200).optional().nullable(),
  primaryPhone: z.string().trim().max(80).optional().nullable(),
  roles: z.array(z.enum(BUSINESS_PARTY_ROLES)).min(1).max(BUSINESS_PARTY_ROLES.length),
  contacts: z.array(businessPartyContactSchema).max(20).default([]),
  addresses: z.array(businessPartyAddressSchema).max(20).default([]),
  notes: optionalText,
});

export const catalogItemCreateSchema = z.object({
  name: z.string().trim().min(2).max(240),
  sku: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  itemType: z.enum(CATALOG_ITEM_TYPES),
  categoryId: z.string().trim().min(1).optional().nullable(),
  unitOfMeasureId: z.string().trim().min(1),
  indicativeSalePrice: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  indicativeCost: z.coerce.number().nonnegative().max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).optional().nullable(),
  taxable: z.boolean().default(false),
  taxCode: z.string().trim().max(80).optional().nullable(),
  trackInventory: z.boolean().default(false),
  notes: optionalText,
});

export const siteCreateSchema = z.object({
  name: z.string().trim().min(2).max(240),
  siteType: z.enum(SITE_TYPES),
  addressLine1: z.string().trim().max(250).optional().nullable(),
  addressLine2: z.string().trim().max(250).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  stateProvince: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(40).optional().nullable(),
  countryCode: z.string().trim().toUpperCase().max(3).optional().nullable(),
  timezone: z.string().trim().max(80).optional().nullable(),
  managerUserId: z.string().trim().min(1).optional().nullable(),
});

export const warehouseCreateSchema = z.object({
  siteId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(240),
  warehouseType: z.string().trim().min(2).max(80).default("GENERAL"),
  managerUserId: z.string().trim().min(1).optional().nullable(),
});
