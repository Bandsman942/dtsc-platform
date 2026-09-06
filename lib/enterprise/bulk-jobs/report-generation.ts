import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { ENTERPRISE_BULK_LIMITS } from "@/lib/enterprise/bulk-jobs/constants";
import type { FinanceReportGenerationJobPayload } from "@/lib/enterprise/bulk-jobs/queue";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { generateEnterpriseReport } from "@/lib/enterprise/finance/report-service";
import { enterpriseReportGenerateSchema } from "@/lib/enterprise/finance/validators";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

type FinanceReportClaimedJob = {
  id: string;
  organizationId: string;
  entityId: string;
  payloadJson: Prisma.JsonValue | null;
};

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function payloadFor(job: FinanceReportClaimedJob) {
  const payload = asObject(job.payloadJson) as unknown as FinanceReportGenerationJobPayload;
  if (
    payload.version !== 1
    || payload.kind !== "FINANCE_REPORT_GENERATION"
    || !payload.actorUserId
    || !payload.requestDigest
    || job.entityId !== payload.requestDigest
    || payload.calculationVersion !== ENTERPRISE_BULK_LIMITS.financeReportCalculationVersion
  ) {
    throw new EnterpriseCoreV2Error("La demande de rapport durable est invalide.", 409, "FINANCE_REPORT_JOB_PAYLOAD_INVALID");
  }
  return payload;
}

async function persistResult(job: FinanceReportClaimedJob, payload: FinanceReportGenerationJobPayload, reportId: string, durationMs: number) {
  const nextPayload: FinanceReportGenerationJobPayload = {
    ...payload,
    resultReportId: reportId,
    completedAt: new Date().toISOString(),
    durationMs,
  };
  await prisma.enterpriseDomainEvent.update({
    where: { id: job.id },
    data: { payloadJson: nextPayload as unknown as Prisma.InputJsonValue },
  });
}

export async function processFinanceReportGenerationJob(job: FinanceReportClaimedJob) {
  const payload = payloadFor(job);
  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: payload.actorUserId,
    organizationId: job.organizationId,
    moduleCode: "REPORTS",
  });
  if (!capabilities.canCreate) {
    throw new EnterpriseCoreV2Error("L’accès requis pour générer ce rapport n’est plus disponible.", 403, "FINANCE_REPORT_GENERATION_ACCESS_REVOKED");
  }

  const parsed = enterpriseReportGenerateSchema.safeParse(payload.input);
  if (!parsed.success) {
    throw new EnterpriseCoreV2Error("Les paramètres du rapport ne sont plus valides.", 400, "FINANCE_REPORT_GENERATION_INPUT_INVALID");
  }

  const existing = await prisma.enterpriseReport.findFirst({
    where: { organizationId: job.organizationId, generationKey: payload.requestDigest },
  });
  if (existing) {
    await persistResult(job, payload, existing.id, payload.durationMs || 0);
    return { report: existing, alreadyGenerated: true };
  }

  const startedAt = Date.now();
  let report: Awaited<ReturnType<typeof generateEnterpriseReport>>;
  try {
    report = await generateEnterpriseReport(job.organizationId, payload.actorUserId, parsed.data, {
      generationKey: payload.requestDigest,
      calculationVersion: payload.calculationVersion,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.enterpriseReport.findFirst({
        where: { organizationId: job.organizationId, generationKey: payload.requestDigest },
      });
      if (raced) report = raced;
      else throw error;
    } else {
      throw error;
    }
  }

  const durationMs = Math.max(0, Date.now() - startedAt);
  await persistResult(job, payload, report.id, durationMs);
  await writeAuditLog({
    userId: payload.actorUserId,
    organizationId: job.organizationId,
    action: "ENTERPRISE_REPORT_GENERATED",
    entity: "EnterpriseReport",
    entityId: report.id,
    reasonCode: "REPORT_DURABLE_GENERATION",
    riskLevel: "MEDIUM",
    metadata: {
      reportType: report.reportType,
      schemaVersion: report.schemaVersion,
      calculationVersion: report.calculationVersion,
      queueJobId: job.id,
      durationMs,
    },
  });
  return { report, alreadyGenerated: false };
}
