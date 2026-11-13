#!/usr/bin/env node
/**
 * Issue #1146: bounded per-organization audit / controlled redaction of legacy
 * EnterpriseSectorRecord clinical copies. NEVER touches canonical Health tables.
 *
 * Audit: node scripts/health-legacy-projection-redact.mjs --organization-id=...
 * Apply: requires a verified Neon snapshot AND an explicit operator gate.
 * Logs contain only aggregate counts; no patient, record or payload values.
 */
import { PrismaClient } from "@prisma/client";
import {
  DEDICATED_HEALTH_LEGACY_MODULES,
  isRedactionCandidate,
  sanitizedLegacyFields,
} from "./lib/health-legacy-redaction.mjs";

const BATCH_SIZE = 100;
const MAX_SCAN = 10000;
const ACCEPTED = new Set([
  "organization-id", "max-scanned", "apply", "snapshot-ref", "ack",
]);
function parseOptions(argv) {
  const options = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error("INVALID_ARGUMENT");
    const [name, ...rest] = arg.slice(2).split("=");
    if (!ACCEPTED.has(name) || options.has(name)) throw new Error("INVALID_ARGUMENT");
    options.set(name, rest.length ? rest.join("=") : true);
  }
  const organizationId = options.get("organization-id");
  if (typeof organizationId !== "string" || !/^[a-zA-Z0-9_-]{3,100}$/.test(organizationId)) {
    throw new Error("ORGANIZATION_ID_REQUIRED");
  }
  const rawLimit = options.get("max-scanned") ?? String(MAX_SCAN);
  const maxScanned = Number(rawLimit);
  if (!Number.isSafeInteger(maxScanned) || maxScanned < 1 || maxScanned > MAX_SCAN) {
    throw new Error("INVALID_SCAN_LIMIT");
  }
  const apply = options.get("apply") === true;
  if (!apply && (options.has("ack") || options.has("snapshot-ref"))) {
    throw new Error("APPLY_FLAGS_WITHOUT_APPLY");
  }
  if (apply) {
    if (process.env.HEALTH_LEGACY_REDACTION_ENABLE !== "true" ||
        options.get("ack") !== "REDACT_LEGACY_CLINICAL_TEXT" ||
        typeof options.get("snapshot-ref") !== "string" ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(options.get("snapshot-ref"))) {
      throw new Error("SNAPSHOT_AND_OPERATOR_APPROVAL_REQUIRED");
    }
  }
  return { organizationId, maxScanned, apply };
}

async function main() {
  const { organizationId, maxScanned, apply } = parseOptions(process.argv.slice(2));
  const prisma = new PrismaClient();
  const totals = { scanned: 0, candidates: 0, redacted: 0, concurrent: 0, batches: 0 };
  let cursor;
  try {
    while (totals.scanned < maxScanned) {
      const take = Math.min(BATCH_SIZE, maxScanned - totals.scanned);
      const rows = await prisma.enterpriseSectorRecord.findMany({
        where: {
          organizationId,
          sectorCode: "HEALTH_CARE",
          moduleCode: { in: [...DEDICATED_HEALTH_LEGACY_MODULES] },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: {
          id: true, organizationId: true, sectorCode: true, moduleCode: true,
          title: true, summary: true, payloadJson: true, updatedAt: true,
        },
        orderBy: { id: "asc" },
        take,
      });
      if (!rows.length) break;
      totals.batches++;
      for (const row of rows) {
        cursor = row.id;
        totals.scanned++;
        if (!isRedactionCandidate(row)) continue;
        totals.candidates++;
        if (!apply) continue;

        // Atomic, idempotent field update with optimistic concurrency guard.
        // No re-use of the clinical text and no modification of canonical Health.
        const result = await prisma.enterpriseSectorRecord.updateMany({
          where: {
            id: row.id, organizationId, sectorCode: "HEALTH_CARE",
            moduleCode: row.moduleCode, updatedAt: row.updatedAt,
          },
          data: sanitizedLegacyFields(row),
        });
        if (result.count === 1) totals.redacted++;
        else totals.concurrent++;
      }
      if (rows.length < take) break;
    }
    console.log(JSON.stringify({
      mode: apply ? "APPLY" : "DRY_RUN",
      scanned: totals.scanned,
      candidates: totals.candidates,
      redacted: totals.redacted,
      concurrent: totals.concurrent,
      batches: totals.batches,
      scanLimitReached: totals.scanned >= maxScanned,
      note: apply
        ? "Verify zero candidates via a fresh dry run; restore only from a tested private snapshot under incident control."
        : "No writes performed. Human-reviewed snapshot and independent E2E required before apply.",
    }));
    if (apply && totals.concurrent > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
try {
  await main();
} catch (error) {
  // No error.message or stack: Prisma errors can carry query context.
  console.error("HEALTH_LEGACY_REDACTION_FAILED", error?.code ?? error?.name ?? "ERROR");
  process.exitCode = 1;
}
