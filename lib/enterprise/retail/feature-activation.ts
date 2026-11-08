import { Prisma } from "@prisma/client";
import { resolveEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { RETAIL_OWNER_ROLES, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

export const RETAIL_ACTIVATION_FEATURES = ["siteStaffIsolationEnabled", "invoiceCheckoutEnabled"] as const;
export type RetailActivationFeature = (typeof RETAIL_ACTIVATION_FEATURES)[number];
type Reader = typeof prisma | Prisma.TransactionClient;
type ActivationSettings = { siteStaffIsolationEnabled: boolean; invoiceCheckoutEnabled: boolean };
type CheckCode =
  | "RETAIL_ACTIVE" | "SITES_CONFIGURED" | "WAREHOUSES_PER_SITE" | "ACCOUNTS_PER_SITE"
  | "STAFF_PER_SITE" | "INVOICERS_PER_SITE" | "CASHIERS_PER_SITE" | "FINANCE_READY" | "ISOLATION_ACTIVE";

function flags(settings: Prisma.JsonValue | null | undefined): ActivationSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { siteStaffIsolationEnabled: false, invoiceCheckoutEnabled: false };
  }
  return {
    siteStaffIsolationEnabled: settings.siteStaffIsolationEnabled === true,
    invoiceCheckoutEnabled: settings.invoiceCheckoutEnabled === true,
  };
}

async function preflight(db: Reader, organizationId: string) {
  const [organization, configuration, sites, finance] = await Promise.all([
    db.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
      select: { id: true },
    }),
    db.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { id: true, status: true, baseCurrencyCode: true, settingsJson: true, revision: true },
    }),
    db.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null }, take: 101,
      select: { id: true },
    }),
    resolveEnterpriseFinanceReadiness(db, organizationId, { mode: "POSTING" }),
  ]);
  if (!organization) throw new EnterpriseRetailError("RETAIL_SECTOR_REQUIRED", 403);
  const siteIds = sites.map((site) => site.id);
  const [warehouses, accounts, assignments] = await Promise.all([
    db.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, siteId: { in: siteIds } }, take: 1001,
      select: { siteId: true },
    }),
    db.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, siteId: { in: siteIds },
        ledgerAccount: { isActive: true, archivedAt: null } }, take: 1001,
      select: { siteId: true, currencyCode: true },
    }),
    db.enterpriseRetailSiteAssignment.findMany({
      where: { organizationId, isActive: true, siteId: { in: siteIds },
        member: { status: "ACTIVE", removedAt: null } }, take: 1001,
      select: { siteId: true, roleCode: true, permissionsJson: true },
    }),
  ]);
  const bounded = sites.length <= 100 && warehouses.length <= 1000 && accounts.length <= 1000 && assignments.length <= 1000;
  const byCapability = (capability: "VIEW_SALES" | "PREPARE_INVOICE" | "COLLECT_PAYMENT") =>
    bounded && siteIds.length > 0 && siteIds.every((id) => assignments.some((assignment) =>
      assignment.siteId === id && siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes(capability)));
  const configured = flags(configuration?.settingsJson);
  const checks: Record<CheckCode, boolean> = {
    RETAIL_ACTIVE: configuration?.status === "ACTIVE",
    SITES_CONFIGURED: bounded && sites.length > 0,
    WAREHOUSES_PER_SITE: bounded && siteIds.length > 0 && siteIds.every((id) => warehouses.some((row) => row.siteId === id)),
    ACCOUNTS_PER_SITE: bounded && siteIds.length > 0 && siteIds.every((id) => accounts.some((row) =>
      row.siteId === id && row.currencyCode === configuration?.baseCurrencyCode &&
      row.currencyCode === finance.configuration?.functionalCurrencyCode)),
    STAFF_PER_SITE: byCapability("VIEW_SALES"),
    INVOICERS_PER_SITE: byCapability("PREPARE_INVOICE"),
    CASHIERS_PER_SITE: byCapability("COLLECT_PAYMENT"),
    FINANCE_READY: finance.ready && finance.configuration?.readinessStatus === "READY",
    ISOLATION_ACTIVE: configured.siteStaffIsolationEnabled,
  };
  const isolationRequired: CheckCode[] = ["RETAIL_ACTIVE", "SITES_CONFIGURED", "WAREHOUSES_PER_SITE", "ACCOUNTS_PER_SITE", "STAFF_PER_SITE"];
  const invoiceRequired: CheckCode[] = [...isolationRequired, "INVOICERS_PER_SITE", "CASHIERS_PER_SITE", "FINANCE_READY", "ISOLATION_ACTIVE"];
  const missing = (required: CheckCode[]) => required.filter((code) => !checks[code]);
  return {
    configuration, flags: configured, checks,
    prerequisites: {
      siteStaffIsolationEnabled: { ready: missing(isolationRequired).length === 0, missing: missing(isolationRequired) },
      invoiceCheckoutEnabled: { ready: missing(invoiceRequired).length === 0, missing: missing(invoiceRequired) },
    },
    counts: { sites: sites.length, assignedStaff: assignments.length },
  };
}

export async function getRetailFeatureActivation(organizationId: string, page = 1) {
  const state = await preflight(prisma, organizationId);
  const where = {
    organizationId, entity: "EnterpriseRetailConfiguration", entityId: state.configuration?.id || "",
    action: { in: ["ENTERPRISE_RETAIL_FEATURE_ENABLED", "ENTERPRISE_RETAIL_FEATURE_DISABLED"] },
  };
  const [history, total] = state.configuration ? await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 8, take: 8,
      select: { id: true, action: true, createdAt: true, beforeJson: true, afterJson: true, metadata: true,
        user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]) : [[], 0];
  return {
    revision: state.configuration?.revision ?? null,
    flags: state.flags, checks: state.checks, prerequisites: state.prerequisites, counts: state.counts,
    history: history.map((row) => ({ id: row.id, action: row.action, at: row.createdAt,
      actorName: row.user?.name || null,
      feature: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) && typeof row.metadata.feature === "string"
        ? row.metadata.feature : null,
      reason: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) && typeof row.metadata.reason === "string"
        ? row.metadata.reason : null,
      before: flags(row.beforeJson), after: flags(row.afterJson),
    })),
    historyPagination: { page, pageSize: 8, total, pageCount: Math.max(1, Math.ceil(total / 8)) },
  };
}

export async function changeRetailFeatureActivation(input: {
  organizationId: string; actorUserId: string; feature: RetailActivationFeature;
  enabled: boolean; revision: number; reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const { organizationId, actorUserId, feature, enabled, revision, reason } = input;
    // Serialize both feature toggles and their prerequisite reads with respect
    // to the canonical Retail configuration row. Optimistic revision prevents
    // a stale browser tab from overwriting another administrator's decision.
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailConfiguration" WHERE "organizationId" = ${organizationId} FOR UPDATE`);
    const state = await preflight(tx, organizationId);
    const configuration = state.configuration;
    if (!configuration) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
    if (configuration.revision !== revision) throw new EnterpriseRetailError("RETAIL_FEATURE_ACTIVATION_CONFLICT", 409);
    if (state.flags[feature] === enabled) throw new EnterpriseRetailError("RETAIL_FEATURE_ACTIVATION_UNCHANGED", 409);
    if (enabled && !state.prerequisites[feature].ready) {
      throw new EnterpriseRetailError("RETAIL_FEATURE_ACTIVATION_NOT_READY", 409, {
        missing: state.prerequisites[feature].missing,
      });
    }
    if (!enabled && feature === "siteStaffIsolationEnabled") {
      if (state.flags.invoiceCheckoutEnabled) throw new EnterpriseRetailError("RETAIL_FEATURE_ISOLATION_DEPENDENCY", 409);
      // Opting back into legacy cross-site visibility is unsafe while any
      // employee can still use enterprise modules. Require an owner-only
      // organization and an explicit new onboarding decision before rollback.
      const nonOwnerMembers = await tx.organizationMember.count({ where: {
        organizationId, status: "ACTIVE", removedAt: null,
        role: { notIn: [...RETAIL_OWNER_ROLES] },
      } });
      if (nonOwnerMembers > 0) throw new EnterpriseRetailError("RETAIL_FEATURE_ISOLATION_ROLLBACK_UNSAFE", 409);
    }
    if (!enabled && feature === "invoiceCheckoutEnabled") {
      const [unsettledInvoices, pendingReturns, pendingPayments] = await Promise.all([
        tx.enterpriseRetailInvoiceCheckout.count({ where: { organizationId,
          OR: [
            { invoice: { status: { notIn: ["PAID", "CREDIT_NOTE", "CANCELLED"] } } },
            { invoice: { status: "PAID" }, stockPostedAt: null },
          ],
        } }),
        tx.enterpriseRetailInvoiceReturnRequest.count({ where: { organizationId,
          status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] },
        } }),
        tx.enterpriseRetailInvoicePaymentProposal.count({ where: { organizationId,
          payment: { status: { notIn: ["CONFIRMED", "CANCELLED", "REJECTED", "REVERSED"] } },
        } }),
      ]);
      if (unsettledInvoices || pendingReturns || pendingPayments) {
        throw new EnterpriseRetailError("RETAIL_FEATURE_INVOICE_ROLLBACK_BLOCKED", 409, {
          unsettledInvoices, pendingReturns, pendingPayments,
        });
      }
    }
    const previous = configuration.settingsJson && typeof configuration.settingsJson === "object" && !Array.isArray(configuration.settingsJson)
      ? configuration.settingsJson as Prisma.JsonObject : {};
    const next = { ...previous, [feature]: enabled };
    const updated = await tx.enterpriseRetailConfiguration.updateMany({
      where: { organizationId, revision },
      data: { settingsJson: next as Prisma.InputJsonObject, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseRetailError("RETAIL_FEATURE_ACTIVATION_CONFLICT", 409);
    const before = state.flags;
    const after = { ...before, [feature]: enabled };
    // Keep the decision and the configuration in ONE transaction. A missing
    // audit record must roll back the switch rather than create silent changes.
    await tx.auditLog.create({ data: {
      organizationId, userId: actorUserId,
      action: enabled ? "ENTERPRISE_RETAIL_FEATURE_ENABLED" : "ENTERPRISE_RETAIL_FEATURE_DISABLED",
      entity: "EnterpriseRetailConfiguration", entityId: configuration.id,
      riskLevel: "CRITICAL", beforeJson: before, afterJson: after,
      metadata: { organizationId, feature, reason, previousRevision: revision, nextRevision: revision + 1 },
    } });
    return { flags: after, revision: revision + 1 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 45000 });
}
