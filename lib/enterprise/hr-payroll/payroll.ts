import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertOrganizationApprover, hrReference, publishHrEvent } from "@/lib/enterprise/hr-payroll/helpers";
import type {
  payrollPeriodCreateSchema,
  payrollRunCancelSchema,
  payrollRunDecisionSchema,
  payrollRunPrepareSchema,
  payrollRunSubmitSchema,
} from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";

type PayrollPeriodCreateInput = z.infer<typeof payrollPeriodCreateSchema>;
type PayrollRunPrepareInput = z.infer<typeof payrollRunPrepareSchema>;
type PayrollRunSubmitInput = z.infer<typeof payrollRunSubmitSchema>;
type PayrollRunDecisionInput = z.infer<typeof payrollRunDecisionSchema>;
type PayrollRunCancelInput = z.infer<typeof payrollRunCancelSchema>;

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function createEnterprisePayrollPeriod(
  organizationId: string,
  actorUserId: string,
  input: PayrollPeriodCreateInput,
) {
  if (input.periodEnd < input.periodStart) {
    throw new EnterpriseDomainError("PAYROLL_PERIOD_RANGE_INVALID");
  }
  if (input.payDate && input.payDate < input.periodEnd) {
    throw new EnterpriseDomainError("PAYROLL_PAY_DATE_INVALID");
  }

  return prisma.enterprisePayrollPeriod.create({
    data: {
      organizationId,
      code: input.code,
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      payDate: input.payDate || null,
      createdByUserId: actorUserId,
    },
  });
}

export async function prepareEnterprisePayrollRun(
  organizationId: string,
  actorUserId: string,
  input: PayrollRunPrepareInput,
) {
  const employeeIds = [...new Set(input.employeeIds)];
  if (employeeIds.length !== input.employeeIds.length) {
    throw new EnterpriseDomainError("PAYROLL_EMPLOYEE_DUPLICATE");
  }
  const adjustments = new Map(input.adjustments.map((item) => [item.employeeId, item]));
  if (adjustments.size !== input.adjustments.length) {
    throw new EnterpriseDomainError("PAYROLL_ADJUSTMENT_DUPLICATE");
  }

  return prisma.$transaction(async (tx) => {
    const period = await tx.enterprisePayrollPeriod.findFirst({
      where: { id: input.payrollPeriodId, organizationId, status: "OPEN" },
    });
    if (!period) throw new EnterpriseDomainError("PAYROLL_PERIOD_NOT_OPEN", 404);

    const existing = await tx.enterprisePayrollRun.findFirst({
      where: {
        organizationId,
        payrollPeriodId: period.id,
        archivedAt: null,
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      select: { id: true },
    });
    if (existing) throw new EnterpriseDomainError("PAYROLL_RUN_ALREADY_EXISTS", 409);

    const employees = await tx.enterpriseEmployee.findMany({
      where: {
        organizationId,
        id: { in: employeeIds },
        employmentStatus: "ACTIVE",
        archivedAt: null,
      },
      include: {
        contracts: {
          where: {
            status: "ACTIVE",
            archivedAt: null,
            startDate: { lte: period.periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: period.periodStart } }],
          },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });
    if (employees.length !== employeeIds.length) {
      throw new EnterpriseDomainError("PAYROLL_EMPLOYEE_NOT_ACTIVE", 404);
    }

    const approvedTimes = await tx.enterpriseTimesheet.groupBy({
      by: ["employeeId"],
      where: {
        organizationId,
        employeeId: { in: employeeIds },
        status: "APPROVED",
        archivedAt: null,
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      _sum: { totalApprovedMinutes: true },
    });
    const approvedMinutesByEmployee = new Map(
      approvedTimes.map((item) => [item.employeeId, item._sum.totalApprovedMinutes || 0]),
    );

    const items = employees.map((employee) => {
      const contract = employee.contracts[0];
      if (!contract) throw new EnterpriseDomainError("ACTIVE_EMPLOYMENT_CONTRACT_REQUIRED", 409);
      if (contract.compensationCurrency !== input.currency) {
        throw new EnterpriseDomainError("PAYROLL_CURRENCY_MISMATCH", 409);
      }
      const adjustment = adjustments.get(employee.id);
      const baseGrossAmount = money(Number(contract.baseCompensation));
      const bonusAmount = money(adjustment?.bonusAmount || 0);
      const deductionAmount = money(adjustment?.deductionAmount || 0);
      const grossAmount = money(baseGrossAmount + bonusAmount);
      if (deductionAmount > grossAmount) {
        throw new EnterpriseDomainError("PAYROLL_DEDUCTION_EXCEEDS_GROSS", 409);
      }
      return {
        organizationId,
        employeeId: employee.id,
        employmentContractId: contract.id,
        baseGrossAmount,
        approvedTimeMinutes: approvedMinutesByEmployee.get(employee.id) || null,
        bonusAmount,
        bonusReason: adjustment?.bonusReason || null,
        deductionAmount,
        deductionReason: adjustment?.deductionReason || null,
        grossAmount,
        netAmount: money(grossAmount - deductionAmount),
      };
    });

    const grossAmount = money(items.reduce((sum, item) => sum + item.grossAmount, 0));
    const bonusAmount = money(items.reduce((sum, item) => sum + item.bonusAmount, 0));
    const deductionAmount = money(items.reduce((sum, item) => sum + item.deductionAmount, 0));
    const netAmount = money(items.reduce((sum, item) => sum + item.netAmount, 0));

    const run = await tx.enterprisePayrollRun.create({
      data: {
        organizationId,
        payrollPeriodId: period.id,
        reference: hrReference("PAY"),
        status: "PREPARED",
        currency: input.currency,
        employeeCount: items.length,
        grossAmount,
        bonusAmount,
        deductionAmount,
        netAmount,
        preparedByUserId: actorUserId,
        preparedAt: new Date(),
        items: { create: items },
      },
      include: { items: true, payrollPeriod: true },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterprisePayrollRun",
      entityId: run.id,
      eventType: "PAYROLL_RUN_PREPARED",
      summary: `Paie ${run.reference} préparée pour ${items.length} employé(s)`,
      actorUserId,
      toStatus: "PREPARED",
      metadataJson: { payrollPeriodId: period.id, netAmount, currency: input.currency },
    });
    return run;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitEnterprisePayrollRun(
  organizationId: string,
  payrollRunId: string,
  actorUserId: string,
  input: PayrollRunSubmitInput,
) {
  await assertOrganizationApprover(prisma, organizationId, input.approverUserId, actorUserId);
  return prisma.$transaction(async (tx) => {
    const run = await tx.enterprisePayrollRun.findFirst({
      where: { id: payrollRunId, organizationId, status: "PREPARED", archivedAt: null },
    });
    if (!run) throw new EnterpriseDomainError("PAYROLL_RUN_NOT_PREPARED", 404);
    const updated = await tx.enterprisePayrollRun.updateMany({
      where: { id: run.id, organizationId, status: "PREPARED", revision: input.revision },
      data: {
        status: "PENDING_APPROVAL",
        submittedByUserId: actorUserId,
        approverUserId: input.approverUserId,
        submittedAt: new Date(),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterprisePayrollRun",
        targetEntityId: run.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
      },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterprisePayrollRun",
      entityId: run.id,
      eventType: "PAYROLL_RUN_SUBMITTED",
      summary: `Paie ${run.reference} soumise pour approbation`,
      actorUserId,
      fromStatus: "PREPARED",
      toStatus: "PENDING_APPROVAL",
    });
    return tx.enterprisePayrollRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { items: true, payrollPeriod: true },
    });
  });
}

export async function decideEnterprisePayrollRun(
  organizationId: string,
  payrollRunId: string,
  actorUserId: string,
  input: PayrollRunDecisionInput,
) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.enterprisePayrollRun.findFirst({
      where: { id: payrollRunId, organizationId, status: "PENDING_APPROVAL", archivedAt: null },
      include: { items: true, payrollPeriod: true },
    });
    if (!run) throw new EnterpriseDomainError("PAYROLL_RUN_NOT_PENDING", 404);
    if (run.approverUserId !== actorUserId) throw new EnterpriseDomainError("NOT_PAYROLL_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({
      where: {
        organizationId,
        targetEntityType: "EnterprisePayrollRun",
        targetEntityId: run.id,
        status: "PENDING",
        approverUserId: actorUserId,
      },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    if (approval.requestedByUserId === actorUserId) {
      throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    }

    if (input.decision === "REJECT") {
      const updated = await tx.enterprisePayrollRun.updateMany({
        where: { id: run.id, organizationId, status: "PENDING_APPROVAL", revision: input.revision },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectionReason: input.comment || "Paie rejetée",
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({
        where: { id: approval.id },
        data: {
          status: "REJECTED",
          decidedAt: new Date(),
          decisionComment: input.comment || null,
          revision: { increment: 1 },
        },
      });
      await publishHrEvent(tx, {
        organizationId,
        entityType: "EnterprisePayrollRun",
        entityId: run.id,
        eventType: "PAYROLL_RUN_REJECTED",
        summary: `Paie ${run.reference} rejetée`,
        actorUserId,
        fromStatus: "PENDING_APPROVAL",
        toStatus: "REJECTED",
      });
      return tx.enterprisePayrollRun.findUniqueOrThrow({
        where: { id: run.id },
        include: { items: true, payrollPeriod: true },
      });
    }

    const updated = await tx.enterprisePayrollRun.updateMany({
      where: { id: run.id, organizationId, status: "PENDING_APPROVAL", revision: input.revision },
      data: { status: "APPROVED", approvedAt: new Date(), revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();

    for (const item of run.items) {
      await tx.enterprisePayslip.upsert({
        where: { organizationId_payrollItemId: { organizationId, payrollItemId: item.id } },
        update: {
          status: "GENERATED",
          generatedAt: new Date(),
          grossAmount: item.grossAmount,
          deductionAmount: item.deductionAmount,
          netAmount: item.netAmount,
          currency: run.currency,
          revision: { increment: 1 },
        },
        create: {
          organizationId,
          payrollItemId: item.id,
          payslipNumber: hrReference("PSL"),
          status: "GENERATED",
          generatedAt: new Date(),
          grossAmount: item.grossAmount,
          deductionAmount: item.deductionAmount,
          netAmount: item.netAmount,
          currency: run.currency,
          createdByUserId: actorUserId,
        },
      });
    }
    await tx.enterprisePayrollPeriod.update({
      where: { id: run.payrollPeriodId },
      data: { status: "CLOSED", revision: { increment: 1 } },
    });
    await tx.enterpriseApproval.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decisionComment: input.comment || null,
        revision: { increment: 1 },
      },
    });
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterprisePayrollRun",
      entityId: run.id,
      eventType: "PAYROLL_RUN_APPROVED",
      summary: `Paie ${run.reference} approuvée et bulletins générés`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "APPROVED",
      metadataJson: { payslipCount: run.items.length, paymentCreated: false },
    });
    return tx.enterprisePayrollRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { items: { include: { payslip: true } }, payrollPeriod: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelEnterprisePayrollRun(
  organizationId: string,
  payrollRunId: string,
  actorUserId: string,
  input: PayrollRunCancelInput,
) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.enterprisePayrollRun.findFirst({
      where: {
        id: payrollRunId,
        organizationId,
        status: { in: ["PREPARED", "REJECTED"] },
        archivedAt: null,
      },
    });
    if (!run) throw new EnterpriseDomainError("PAYROLL_RUN_NOT_CANCELLABLE", 409);
    const updated = await tx.enterprisePayrollRun.updateMany({
      where: { id: run.id, organizationId, revision: input.revision, status: run.status },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishHrEvent(tx, {
      organizationId,
      entityType: "EnterprisePayrollRun",
      entityId: run.id,
      eventType: "PAYROLL_RUN_CANCELLED",
      summary: `Paie ${run.reference} annulée`,
      actorUserId,
      fromStatus: run.status,
      toStatus: "CANCELLED",
      metadataJson: { reason: input.reason },
    });
    return tx.enterprisePayrollRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { items: true, payrollPeriod: true },
    });
  });
}
