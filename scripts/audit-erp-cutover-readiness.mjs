#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function parseArgs(argv) {
  const result = { dryRun: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") result.dryRun = true;
    else if (value === "--json") result.json = true;
    else if (value === "--organization-id") result.organizationId = argv[++index];
    else if (value === "--domain") result.domain = argv[++index]?.toUpperCase();
    else if (value === "--from-date") result.fromDate = argv[++index];
    else if (value === "--to-date") result.toDate = argv[++index];
    else if (value === "--output") result.output = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function dateRange(args) {
  const range = {};
  if (args.fromDate) range.gte = new Date(args.fromDate);
  if (args.toDate) range.lte = new Date(args.toDate);
  if ((range.gte && Number.isNaN(range.gte.getTime())) || (range.lte && Number.isNaN(range.lte.getTime()))) {
    throw new Error("Invalid --from-date or --to-date");
  }
  return Object.keys(range).length ? range : null;
}

async function safeCount(delegate, where) {
  if (!delegate?.count) return null;
  return delegate.count({ where });
}

async function auditOrganization(prisma, organization, args, range) {
  const scoped = { organizationId: organization.id };
  const updatedWhere = range ? { ...scoped, updatedAt: range } : scoped;
  const domain = args.domain;
  const includeCore = !domain || domain === "CORE" || domain === "ALL";
  const includePharmacy = !domain || domain === "PHARMACY" || domain === "ALL";
  const includeHealth = !domain || domain === "HEALTH" || domain === "HEALTH_CARE" || domain === "ALL";

  const legacy = {
    coreRecords: includeCore ? await safeCount(prisma.enterpriseCoreRecord, updatedWhere) : 0,
    sectorRecords: includePharmacy || includeHealth ? await safeCount(prisma.enterpriseSectorRecord, updatedWhere) : 0,
    workflows: includeCore ? await safeCount(prisma.enterpriseWorkflow, updatedWhere) : 0,
  };

  const pharmacy = includePharmacy ? {
    suppliers: await safeCount(prisma.pharmacySupplierExtension, scoped),
    products: await safeCount(prisma.pharmacyProductExtension, scoped),
    purchases: await safeCount(prisma.pharmacyPurchaseExtension, scoped),
    receipts: await safeCount(prisma.pharmacyReceiptExtension, scoped),
    invoices: await safeCount(prisma.pharmacySalesExtension, scoped),
    payments: await safeCount(prisma.pharmacyPaymentExtension, scoped),
    cashSessions: await safeCount(prisma.pharmacyCashExtension, scoped),
  } : null;

  const health = includeHealth ? {
    patientFinancialProfiles: await safeCount(prisma.healthPatientFinancialProfile, scoped),
    serviceCatalogLinks: await safeCount(prisma.healthServiceCatalogExtension, scoped),
    insurers: await safeCount(prisma.healthInsuranceProviderExtension, scoped),
    invoices: await safeCount(prisma.healthBillingExtension, scoped),
    payments: await safeCount(prisma.healthPaymentExtension, scoped),
  } : null;

  const syncBlocking = await safeCount(prisma.enterpriseSectorSyncState, {
    ...scoped,
    status: { in: ["PENDING", "FAILED", "AMBIGUOUS"] },
  });
  const syncArchived = await safeCount(prisma.enterpriseSectorSyncState, {
    ...scoped,
    status: { in: ["LEGACY_UNMAPPED", "ARCHIVED"] },
  });
  const disabledActiveModules = await safeCount(prisma.enterpriseModule, {
    ...scoped,
    isEnabled: true,
    moduleCode: { in: ["MEDICAL_CONFIDENTIALITY", "HEALTH_SETTINGS", "HEALTH_REPORTS"] },
  });

  const unknownDelegates = [
    ...Object.values(legacy),
    ...(pharmacy ? Object.values(pharmacy) : []),
    ...(health ? Object.values(health) : []),
    syncBlocking,
    syncArchived,
    disabledActiveModules,
  ].some((value) => value === null);

  let status = "READY";
  const blockers = [];
  if (unknownDelegates) {
    status = "MANUAL_REVIEW";
    blockers.push("One or more expected audit delegates are unavailable.");
  }
  if ((syncBlocking || 0) > 0) {
    status = "BLOCKED";
    blockers.push("Sector synchronization contains PENDING, FAILED or AMBIGUOUS states.");
  }
  if ((disabledActiveModules || 0) > 0) {
    status = "BLOCKED";
    blockers.push("Hidden generic Health modules are still enabled for the organization.");
  }
  if (status === "READY" && ((legacy.coreRecords || 0) + (legacy.sectorRecords || 0) + (legacy.workflows || 0) > 0 || (syncArchived || 0) > 0)) {
    status = "READY_WITH_ARCHIVE";
  }

  return {
    organizationId: organization.id,
    organizationCode: organization.slug || organization.id,
    sectorCode: organization.sectorCode || null,
    status,
    blockers,
    counts: { legacy, pharmacy, health, syncBlocking, syncArchived, disabledActiveModules },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const range = dateRange(args);
  const prisma = new PrismaClient();
  try {
    const organizations = await prisma.organization.findMany({
      where: {
        deletedAt: null,
        ...(args.organizationId ? { id: args.organizationId } : {}),
      },
      select: { id: true, slug: true, sectorCode: true },
      orderBy: { id: "asc" },
    });
    if (args.organizationId && organizations.length === 0) throw new Error("Organization not found");
    const results = [];
    for (const organization of organizations) results.push(await auditOrganization(prisma, organization, args, range));
    const summary = {
      generatedAt: new Date().toISOString(),
      dryRun: true,
      requestedDryRun: args.dryRun,
      domain: args.domain || "ALL",
      range: { from: args.fromDate || null, to: args.toDate || null },
      organizations: results.length,
      statuses: results.reduce((accumulator, item) => {
        accumulator[item.status] = (accumulator[item.status] || 0) + 1;
        return accumulator;
      }, {}),
      results,
    };
    const output = JSON.stringify(summary, null, 2);
    if (args.output) {
      const outputPath = path.resolve(args.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${output}\n`, "utf8");
    }
    if (args.json || args.output) console.log(output);
    else {
      for (const item of results) console.log(`${item.organizationCode}: ${item.status}`);
      console.log(`Audited ${results.length} organization(s). No sensitive row content was emitted.`);
    }
    if (results.some((item) => item.status === "BLOCKED")) process.exitCode = 2;
    else if (results.some((item) => item.status === "MANUAL_REVIEW")) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Cutover audit failed");
  process.exitCode = 1;
});
