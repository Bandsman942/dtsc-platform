import { prisma } from "@/lib/prisma";

export const SECTOR_CONVERGENCE_FLAGS = {
  PHARMACY_PARTIES: "ERP_PHARMACY_PARTY_CONVERGENCE",
  PHARMACY_CATALOG: "ERP_PHARMACY_CATALOG_CONVERGENCE",
  PHARMACY_PROCUREMENT: "ERP_PHARMACY_PROCUREMENT_CONVERGENCE",
  PHARMACY_INVENTORY_ACCOUNTING: "ERP_PHARMACY_INVENTORY_ACCOUNTING",
  PHARMACY_FINANCE: "ERP_PHARMACY_FINANCE_CONVERGENCE",
  PHARMACY_CASH: "ERP_PHARMACY_CASH_CONVERGENCE",
  HEALTH_PATIENT_FINANCE: "ERP_HEALTH_PATIENT_FINANCE_CONVERGENCE",
  HEALTH_SERVICE_CATALOG: "ERP_HEALTH_SERVICE_CATALOG_CONVERGENCE",
  HEALTH_BILLING: "ERP_HEALTH_BILLING_CONVERGENCE",
  HEALTH_PAYMENT: "ERP_HEALTH_PAYMENT_CONVERGENCE",
  HEALTH_INSURANCE: "ERP_HEALTH_INSURANCE_CONVERGENCE",
  HEALTH_INTERNAL_PHARMACY_ACCOUNTING: "ERP_HEALTH_INTERNAL_PHARMACY_ACCOUNTING",
} as const;

export type SectorConvergenceFlag = (typeof SECTOR_CONVERGENCE_FLAGS)[keyof typeof SECTOR_CONVERGENCE_FLAGS];

function environmentGate(flag: SectorConvergenceFlag) {
  return process.env[flag]?.trim().toLowerCase() === "true";
}

export async function isSectorConvergenceEnabled({
  organizationId,
  sector,
  domainCode,
  flag,
}: {
  organizationId: string;
  sector: "PHARMACY" | "HEALTH_CARE";
  domainCode: string;
  flag: SectorConvergenceFlag;
}) {
  if (!environmentGate(flag)) return false;
  const state = await prisma.enterpriseSectorCutoverState.findUnique({
    where: { organizationId_sector_domainCode: { organizationId, sector, domainCode } },
    select: { status: true, featureFlag: true },
  });
  return state?.featureFlag === flag && ["ENABLED", "CUTOVER_COMPLETE"].includes(state.status);
}

export function sectorFlagIsGloballyAvailable(flag: SectorConvergenceFlag) {
  return environmentGate(flag);
}
