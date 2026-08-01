import type { Prisma } from "@prisma/client";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";

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

/**
 * Release A compatibility guard.
 * EnterpriseCoreRecord remains queryable for historical evidence, but every
 * new business mutation must use a dedicated Core v2 domain model.
 */
export async function createEnterpriseCoreRecord(): Promise<never> {
  throw new EnterpriseCoreV2Error(
    "EnterpriseCoreRecord est en lecture seule. Utilisez le module ERP dédié.",
    410,
    "LEGACY_CORE_WRITE_DENIED",
  );
}
