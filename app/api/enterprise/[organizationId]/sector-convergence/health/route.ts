import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeSectorConvergenceRequest } from "@/lib/enterprise/sector-convergence/access";
import { bindHealthPayerComponentsToReceivable, convergeHealthMedicalInvoice } from "@/lib/enterprise/sector-convergence/health-billing-service";
import { convergeHealthCoverageReceivable, convergeHealthInsuranceProvider } from "@/lib/enterprise/sector-convergence/health-insurance-service";
import { convergeHealthPatientFinancialProfile } from "@/lib/enterprise/sector-convergence/health-party-service";
import { allocateHealthPaymentToPayerComponent, convergeHealthPayment } from "@/lib/enterprise/sector-convergence/health-payment-service";
import { convergeHealthBillingService } from "@/lib/enterprise/sector-convergence/health-service-catalog";
import { asSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { healthPayerComponentSchema } from "@/lib/enterprise/sector-convergence/schemas";
import { prisma } from "@/lib/prisma";

const healthActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("MAP_PATIENT_FINANCE"), healthPatientId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_SERVICE_CATALOG"), healthBillingServiceCatalogId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_INSURER"), healthInsuranceProviderId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_MEDICAL_INVOICE"), healthMedicalInvoiceId: z.string().min(1), payerComponents: z.array(healthPayerComponentSchema).min(1).max(10), eventVersion: z.number().int().positive().default(1) }),
  z.object({ action: z.literal("BIND_RECEIVABLE"), healthMedicalInvoiceId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_COVERAGE_RECEIVABLE"), coverageRequestId: z.string().min(1), payerComponentId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_PAYMENT"), healthMedicalInvoicePaymentId: z.string().min(1), payerComponentId: z.string().min(1), financialAccountId: z.string().min(1) }),
  z.object({ action: z.literal("ALLOCATE_PAYMENT"), paymentId: z.string().min(1), payerComponentId: z.string().min(1), amount: z.string().min(1) }),
]);

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId);
  if (!auth.ok) return auth.response;
  const [patients, services, insurers, invoices, components, coverage, payments] = await Promise.all([
    prisma.healthPatientFinancialProfile.count({ where: { organizationId } }),
    prisma.healthServiceCatalogExtension.count({ where: { organizationId } }),
    prisma.healthInsuranceProviderExtension.count({ where: { organizationId } }),
    prisma.healthBillingExtension.count({ where: { organizationId } }),
    prisma.healthInvoicePayerComponent.groupBy({ by: ["payerType", "status"], where: { organizationId }, _count: { _all: true }, _sum: { outstandingAmount: true, settledAmount: true } }),
    prisma.healthInsuranceReceivableExtension.groupBy({ by: ["claimStatus"], where: { organizationId }, _count: { _all: true }, _sum: { requestedAmount: true, approvedAmount: true, settledAmount: true, rejectedAmount: true } }),
    prisma.healthPaymentExtension.count({ where: { organizationId } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-health" } });
  return NextResponse.json({ mapped: { patients, services, insurers, invoices, payments }, payerComponents: components, insuranceReceivables: coverage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId, { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = healthActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "MAP_PATIENT_FINANCE"
      ? await convergeHealthPatientFinancialProfile(organizationId, input.healthPatientId, auth.session.userId)
      : input.action === "MAP_SERVICE_CATALOG"
        ? await convergeHealthBillingService(organizationId, input.healthBillingServiceCatalogId, auth.session.userId)
        : input.action === "MAP_INSURER"
          ? await convergeHealthInsuranceProvider(organizationId, input.healthInsuranceProviderId, auth.session.userId)
          : input.action === "MAP_MEDICAL_INVOICE"
            ? await convergeHealthMedicalInvoice(organizationId, input.healthMedicalInvoiceId, input.payerComponents, auth.session.userId, { eventVersion: input.eventVersion })
            : input.action === "BIND_RECEIVABLE"
              ? await bindHealthPayerComponentsToReceivable(organizationId, input.healthMedicalInvoiceId)
              : input.action === "MAP_COVERAGE_RECEIVABLE"
                ? await convergeHealthCoverageReceivable(organizationId, input.coverageRequestId, input.payerComponentId, auth.session.userId)
                : input.action === "MAP_PAYMENT"
                  ? await convergeHealthPayment(organizationId, input.healthMedicalInvoicePaymentId, input.payerComponentId, input.financialAccountId, auth.session.userId)
                  : await allocateHealthPaymentToPayerComponent(organizationId, input.paymentId, input.payerComponentId, auth.session.userId, { amount: input.amount });
    await writeAuditLog({ userId: auth.session.userId, action: `SECTOR_CONVERGENCE_${input.action}`, entity: "EnterpriseSectorSyncState", request: req, metadata: { organizationId, sector: "HEALTH_CARE" } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-health", action: input.action } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const mapped = asSectorConvergenceError(error);
    await writeApiLog({ request: req, statusCode: mapped.status, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-health", error: mapped.code } });
    return NextResponse.json({ error: mapped.code, details: mapped.details }, { status: mapped.status });
  }
}
