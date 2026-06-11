import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ENTERPRISE_CORE_MODULES = {
  TASKS_OPERATIONS: {
    title: "Tâches & opérations",
    description: "Suivez les actions opérationnelles assignées aux collaborateurs, issues des demandes, réunions, alertes, workflows ou modules métiers.",
    recordTypes: ["TASK", "OPERATION"],
  },
  MEETINGS: {
    title: "Réunions & comptes rendus",
    description: "Planifiez les réunions, consignez les décisions et transformez les engagements pris en actions suivies.",
    recordTypes: ["MEETING", "MINUTES"],
  },
  INTERNAL_REQUESTS: {
    title: "Demandes internes",
    description: "Centralisez les demandes administratives, financières, opérationnelles ou sectorielles et suivez leur traitement jusqu’à résolution.",
    recordTypes: ["INTERNAL_REQUEST"],
  },
  VALIDATIONS: {
    title: "Validations",
    description: "Traitez dans une file unique les décisions attendues sur les demandes, tâches, documents et opérations métier.",
    recordTypes: ["VALIDATION"],
  },
  DOCUMENTS: {
    title: "Documents entreprise",
    description: "Référencez et reliez les documents autorisés aux opérations, demandes, fournisseurs, workflows et modules métiers.",
    recordTypes: ["DOCUMENT"],
  },
  REPORTS: {
    title: "Rapports entreprise",
    description: "Consolidez des rapports fondés sur les données réelles de l’entreprise et conservez leur historique de production.",
    recordTypes: ["REPORT"],
  },
  FINANCE_BUDGETS: {
    title: "Finances & budgets",
    description: "Suivez les budgets, dépenses et besoins financiers communs avec une traçabilité exploitable par les responsables autorisés.",
    recordTypes: ["BUDGET", "EXPENSE"],
  },
  SUPPLIERS_PURCHASES: {
    title: "Fournisseurs & achats",
    description: "Centralisez les fournisseurs communs, besoins d’achat et suivis de commande sans dupliquer les référentiels sectoriels.",
    recordTypes: ["SUPPLIER", "PURCHASE"],
  },
  NOTIFICATIONS: {
    title: "Notifications métier",
    description: "Consultez les signaux de travail générés par les opérations communes et sectorielles de l’entreprise.",
    recordTypes: ["NOTICE"],
  },
} as const;

export type EnterpriseCoreModuleCode = keyof typeof ENTERPRISE_CORE_MODULES;

export function isEnterpriseCoreModuleCode(value: string): value is EnterpriseCoreModuleCode {
  return value in ENTERPRISE_CORE_MODULES;
}
export function canUseRecordType(moduleCode: EnterpriseCoreModuleCode, recordType: string) {
  return (ENTERPRISE_CORE_MODULES[moduleCode].recordTypes as readonly string[]).includes(recordType);
}

export function enterpriseCoreVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
  moduleCode,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
  moduleCode?: string;
}): Prisma.EnterpriseCoreRecordWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(moduleCode ? { moduleCode } : {}),
    ...(canSeeAll
      ? {}
      : {
          OR: [
            { createdById: userId },
            { requestedById: userId },
            { assignedToUserId: userId },
            { validatorUserId: userId },
          ],
        }),
  };
}

export async function createEnterpriseCoreRecord({
  organizationId,
  actorUserId,
  data,
}: {
  organizationId: string;
  actorUserId: string;
  data: {
    moduleCode: EnterpriseCoreModuleCode;
    recordType: string;
    title: string;
    description?: string;
    priority: string;
    assignedToUserId?: string;
    validatorUserId?: string;
    departmentId?: string;
    dueAt?: Date;
    amount?: number;
    currency?: string;
    sourceModule?: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    sectorCode?: string;
    metadata?: Record<string, unknown>;
  };
}) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.enterpriseCoreRecord.create({
      data: {
        organizationId,
        moduleCode: data.moduleCode,
        recordType: data.recordType,
        title: data.title,
        description: data.description || null,
        status: data.moduleCode === "INTERNAL_REQUESTS" ? "SUBMITTED" : "OPEN",
        priority: data.priority,
        assignedToUserId: data.assignedToUserId || null,
        validatorUserId: data.validatorUserId || null,
        departmentId: data.departmentId || null,
        requestedById: actorUserId,
        createdById: actorUserId,
        dueAt: data.dueAt,
        amount: typeof data.amount === "number" ? new Prisma.Decimal(data.amount) : undefined,
        currency: data.currency || null,
        sourceModule: data.sourceModule || null,
        sourceEntityType: data.sourceEntityType || null,
        sourceEntityId: data.sourceEntityId || null,
        sectorCode: data.sectorCode || null,
        metadataJson: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await tx.enterpriseCoreEvent.create({
      data: {
        organizationId,
        recordId: record.id,
        eventType: "CREATED",
        summary: "Élément créé dans le socle commun ERP.",
        toStatus: record.status,
        actorUserId,
      },
    });
    if (data.sourceModule && data.sourceEntityType && data.sourceEntityId) {
      await tx.enterpriseEntityLink.create({
        data: {
          organizationId,
          sourceModule: data.sourceModule,
          sourceEntityType: data.sourceEntityType,
          sourceEntityId: data.sourceEntityId,
          targetModule: data.moduleCode,
          targetEntityType: "EnterpriseCoreRecord",
          targetEntityId: record.id,
          linkType: "GENERATED",
          createdById: actorUserId,
        },
      });
    }
    return record;
  });
}
