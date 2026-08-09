import { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";

export type RetailCountryCapabilityStatus = "SUPPORTED" | "TENANT_CONFIGURATION_REQUIRED" | "EVIDENCE_REQUIRED" | "NOT_CERTIFIED";

export type RetailCountryPackDefinition = {
  packCode: string;
  countryCode: string;
  version: number;
  labelFr: string;
  labelEn: string;
  defaultCurrencyCode: string;
  supportedCurrencyCodes: string[];
  capabilities: Record<string, { status: RetailCountryCapabilityStatus; noteFr: string; noteEn: string }>;
};

// Country packs describe DTSC product capability, not legal advice. Regulated capabilities stay
// evidence-gated until an implementation and jurisdiction-specific validation are attached.
export const RETAIL_COUNTRY_PACKS: readonly RetailCountryPackDefinition[] = [
  {
    packCode: "CD_RETAIL_CORE_V1",
    countryCode: "CD",
    version: 1,
    labelFr: "RDC — Retail Core",
    labelEn: "DRC — Retail Core",
    defaultCurrencyCode: "CDF",
    supportedCurrencyCodes: ["CDF", "USD"],
    capabilities: {
      CORE_LOCALIZATION: { status: "SUPPORTED", noteFr: "Socle Retail FR/EN et configuration tenant.", noteEn: "FR/EN Retail core and tenant configuration." },
      MULTI_CURRENCY: { status: "SUPPORTED", noteFr: "Devise fonctionnelle, transactionnelle et consolidation FX via Finance commun.", noteEn: "Functional, transactional and FX consolidation through common Finance." },
      TAX_REFERENCE: { status: "TENANT_CONFIGURATION_REQUIRED", noteFr: "Les taxes utilisent le référentiel Finance du tenant ; aucun taux n’est codé dans le pack.", noteEn: "Taxes use the tenant Finance reference; no rate is hardcoded in the pack." },
      DOCUMENT_NUMBERING: { status: "TENANT_CONFIGURATION_REQUIRED", noteFr: "La séquence documentaire reste configurable par organisation.", noteEn: "Document numbering remains organization-configurable." },
      FISCAL_RECEIPT: { status: "EVIDENCE_REQUIRED", noteFr: "Une extension fiscale validée et ses preuves sont requises avant toute déclaration de conformité.", noteEn: "A validated fiscal extension and evidence are required before any compliance claim." },
      E_INVOICING: { status: "NOT_CERTIFIED", noteFr: "Aucune certification e-invoicing n’est déclarée par Retail Core.", noteEn: "Retail Core makes no e-invoicing certification claim." },
    },
  },
] as const;

export function getRetailCountryPack(packCode: string) {
  return RETAIL_COUNTRY_PACKS.find((pack) => pack.packCode === packCode) || null;
}

function evidenceSatisfied(pack: RetailCountryPackDefinition, evidence: unknown) {
  const object = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence as Record<string, unknown> : {};
  const required = Object.entries(pack.capabilities).filter(([, capability]) => capability.status === "EVIDENCE_REQUIRED").map(([code]) => code);
  return required.every((code) => {
    const entry = object[code];
    return entry && typeof entry === "object" && !Array.isArray(entry) && Boolean((entry as Record<string, unknown>).validatedAt) && Boolean((entry as Record<string, unknown>).validatedBy);
  });
}

export async function getRetailCountryPackState(organizationId: string) {
  const activations = await prisma.enterpriseRetailCountryPackActivation.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ updatedAt: "desc" }],
  });
  return {
    registry: RETAIL_COUNTRY_PACKS,
    activations,
  };
}

export async function activateRetailCountryPack(args: {
  organizationId: string;
  actorUserId: string;
  packCode: string;
  countryCode: string;
  configuration?: Prisma.InputJsonValue | null;
  evidence?: Prisma.InputJsonValue | null;
}) {
  const pack = getRetailCountryPack(args.packCode);
  if (!pack || pack.countryCode !== args.countryCode) throw new EnterpriseRetailError("RETAIL_COUNTRY_PACK_UNSUPPORTED", 409);

  const organization = await prisma.organization.findFirst({
    where: { id: args.organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
    select: { id: true, country: true },
  });
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);

  const evidence = args.evidence ?? Prisma.JsonNull;
  const regulatedEvidenceComplete = evidenceSatisfied(pack, args.evidence);
  const status = regulatedEvidenceComplete ? "VALIDATED" : "ACTIVE_CORE";
  const capabilitiesJson = Object.fromEntries(Object.entries(pack.capabilities).map(([code, capability]) => [code, {
    status: capability.status,
    evidenceComplete: capability.status !== "EVIDENCE_REQUIRED" ? capability.status !== "NOT_CERTIFIED" : regulatedEvidenceComplete,
  }])) as Prisma.InputJsonValue;

  return prisma.enterpriseRetailCountryPackActivation.upsert({
    where: { organizationId_packCode: { organizationId: args.organizationId, packCode: pack.packCode } },
    update: {
      countryCode: pack.countryCode,
      packVersion: pack.version,
      status,
      capabilitiesJson,
      configurationJson: args.configuration ?? Prisma.JsonNull,
      evidenceJson: evidence,
      updatedByUserId: args.actorUserId,
      revision: { increment: 1 },
      archivedAt: null,
    },
    create: {
      organizationId: args.organizationId,
      packCode: pack.packCode,
      countryCode: pack.countryCode,
      packVersion: pack.version,
      status,
      capabilitiesJson,
      configurationJson: args.configuration ?? Prisma.JsonNull,
      evidenceJson: evidence,
      activatedByUserId: args.actorUserId,
    },
  });
}
