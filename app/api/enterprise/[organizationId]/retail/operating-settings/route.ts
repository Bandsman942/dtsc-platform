import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { writeApiLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import {
  DEFAULT_RETAIL_OPERATING_SETTINGS, mergeRetailOperatingSettings,
  mergeRetailLegalIdentity, readRetailLegalIdentity, retailLegalIdentitySchema,
  readRetailOperatingSettings, retailOperatingSettingsSchema,
} from "@/lib/enterprise/retail/operating-settings";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const updateSchema = z.object({
  revision: z.number().int().positive(),
  siteId: z.string().trim().min(1).max(191).nullable(),
  settings: retailOperatingSettingsSchema,
  legalIdentity: retailLegalIdentitySchema.optional(),
}).strict();

async function owner(req: Request, organizationId: string, mutation: boolean) {
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", mutation ? "manage" : "read",
    mutation ? { mutation: true, limit: 20 } : undefined);
  if (!auth.ok) return auth;
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null },
    select: { role: true },
  });
  if (!membership || !RETAIL_OWNER_ROLES.has(membership.role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}

async function activeSite(organizationId: string, siteId: string | null) {
  if (!siteId) return;
  const site = await prisma.enterpriseSite.findFirst({
    where: { organizationId, id: siteId, status: "ACTIVE", archivedAt: null },
    select: { id: true },
  });
  if (!site) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 404);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await owner(req, organizationId, false);
  if (!auth.ok) return auth.response;
  try {
    const siteId = new URL(req.url).searchParams.get("siteId") || null;
    if (siteId && siteId.length > 191) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 400);
    await activeSite(organizationId, siteId);
    const [configuration, sites, organization] = await Promise.all([
      prisma.enterpriseRetailConfiguration.findUnique({
        where: { organizationId }, select: { revision: true, settingsJson: true },
      }),
      prisma.enterpriseSite.findMany({
        where: { organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true, name: true, code: true }, take: 200, orderBy: { name: "asc" },
      }),
      prisma.organization.findFirst({
        where: { id: organizationId, status: "ACTIVE", deletedAt: null }, select: { settingsJson: true },
      }),
    ]);
    if (!organization) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 404);
    if (!configuration) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
    const settings = readRetailOperatingSettings(configuration.settingsJson, siteId);
    const inherited = readRetailOperatingSettings(configuration.settingsJson);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-operating-settings", action: "read" } });
    return NextResponse.json({ revision: configuration.revision, settings, inherited,
      legalIdentity: readRetailLegalIdentity(organization.settingsJson),
      isOverridden: Boolean(siteId && configuration.settingsJson &&
        typeof configuration.settingsJson === "object" && !Array.isArray(configuration.settingsJson) &&
        (configuration.settingsJson.retailSiteOperatingOverrides as Record<string, unknown> | undefined)?.[siteId]),
      defaults: DEFAULT_RETAIL_OPERATING_SETTINGS, sites,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_OPERATING_SETTINGS_READ_FAILED"); }
}

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await owner(req, organizationId, true);
  if (!auth.ok) return auth.response;
  if (!await hasRecentStepUp(auth.session)) {
    return NextResponse.json({ error: "STEP_UP_REQUIRED", message: "Confirmez votre identité pour modifier ce mode commercial." },
      { status: 428, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_OPERATING_SETTINGS_INPUT_INVALID", req);
  try {
    await activeSite(organizationId, parsed.data.siteId);
    if (parsed.data.siteId && parsed.data.legalIdentity) {
      throw new EnterpriseRetailError("RETAIL_OPERATING_SETTINGS_INVALID", 400);
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailConfiguration" WHERE "organizationId" = ${organizationId} FOR UPDATE`);
      const existing = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId } });
      if (!existing) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
      if (existing.revision !== parsed.data.revision) throw new EnterpriseRetailError("RETAIL_OPERATING_SETTINGS_CONFLICT", 409);
      const current = readRetailOperatingSettings(existing.settingsJson, parsed.data.siteId);
      let legalBefore = undefined as ReturnType<typeof readRetailLegalIdentity> | undefined;
      if (parsed.data.legalIdentity) {
        // A single company-scoped canonical fiscal identity is shared with Finance.
        // Lock the Organization row to preserve concurrent changes in its settings.
        await tx.$executeRaw(Prisma.sql`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`);
        const organization = await tx.organization.findFirst({
          where: { id: organizationId, status: "ACTIVE", deletedAt: null },
          select: { settingsJson: true },
        });
        if (!organization) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 404);
        legalBefore = readRetailLegalIdentity(organization.settingsJson);
        await tx.organization.update({
          where: { id: organizationId },
          data: { settingsJson: mergeRetailLegalIdentity(organization.settingsJson, parsed.data.legalIdentity) },
        });
      }
      if (parsed.data.settings.directCheckoutEnabled) {
        const flags = existing.settingsJson;
        if (!flags || typeof flags !== "object" || Array.isArray(flags) ||
            flags.siteStaffIsolationEnabled !== true || flags.invoiceCheckoutEnabled !== true) {
          throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 409);
        }
      }
      const nextSettings = mergeRetailOperatingSettings(existing.settingsJson, parsed.data.settings, parsed.data.siteId);
      const nextJson = nextSettings;
      const updated = await tx.enterpriseRetailConfiguration.updateMany({
        where: { organizationId, revision: parsed.data.revision },
        data: { settingsJson: nextJson,
          updatedByUserId: auth.session.userId, revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseRetailError("RETAIL_OPERATING_SETTINGS_CONFLICT", 409);
      await tx.auditLog.create({ data: {
        organizationId, userId: auth.session.userId, action: "ENTERPRISE_RETAIL_OPERATING_MODE_UPDATED",
        entity: "EnterpriseRetailConfiguration", entityId: existing.id, riskLevel: "HIGH",
        beforeJson: { settings: current, legalIdentity: legalBefore },
        afterJson: { settings: parsed.data.settings, legalIdentity: parsed.data.legalIdentity },
        metadata: { organizationId, siteId: parsed.data.siteId, revision: existing.revision + 1 },
      } });
      return { revision: existing.revision + 1, settings: parsed.data.settings };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-operating-settings", action: "update", siteId: parsed.data.siteId } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_OPERATING_SETTINGS_SAVE_FAILED"); }
}
