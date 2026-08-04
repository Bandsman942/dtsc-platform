import type { AdminBlockId } from "@/lib/admin-access";
import { adminBlocks } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";

export const DTSC_SPECIAL_PERMISSIONS = {
  SUBMIT_PAST_WORK_PERIOD: "work.past_period.submit",
  VIEW_TEAM_AVAILABILITY: "calendar.team_availability.read",
  OVERRIDE_CALENDAR_CONFLICTS: "calendar.conflicts.override",
  MANAGE_CALENDAR_RESOURCES: "calendar.resources.manage",
  MANAGE_OPERATIONAL_SLA: "operations.sla.manage",
  CHANGE_ANY_OPERATION_STATUS: "operations.status.manage_any",
  MANAGE_COMMERCIAL_MATURITY: "commercial_maturity.manage",
  PROMOTE_COMMERCIAL_READY: "commercial_maturity.promote_commercial",
  DEGRADE_COMMERCIAL_MATURITY: "commercial_maturity.degrade",
} as const;

export type DtscSpecialPermission = (typeof DTSC_SPECIAL_PERMISSIONS)[keyof typeof DTSC_SPECIAL_PERMISSIONS];

export function adminSectionPermission(blockId: AdminBlockId) {
  return `admin.section.${blockId}.read`;
}

const staticPermissionCatalog = [
  {
    code: DTSC_SPECIAL_PERMISSIONS.SUBMIT_PAST_WORK_PERIOD,
    label: "Soumettre une prestation d'une semaine passée",
    description: "Autorise explicitement la soumission ou la resoumission d'une période de prestation antérieure.",
    category: "Prestations",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.VIEW_TEAM_AVAILABILITY,
    label: "Consulter les disponibilités de l'équipe",
    description: "Autorise la lecture filtrée des disponibilités des collaborateurs DTSC.",
    category: "Calendrier",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.OVERRIDE_CALENDAR_CONFLICTS,
    label: "Déroger aux conflits calendrier",
    description: "Autorise une dérogation explicite aux conflits non bloquants après justification.",
    category: "Calendrier",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.MANAGE_CALENDAR_RESOURCES,
    label: "Gérer les ressources du calendrier",
    description: "Autorise la création, l'archivage et la réservation des salles et ressources internes.",
    category: "Calendrier",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.MANAGE_OPERATIONAL_SLA,
    label: "Gérer les politiques SLA",
    description: "Autorise la configuration et la supervision des SLA opérationnels.",
    category: "Opérations",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.CHANGE_ANY_OPERATION_STATUS,
    label: "Modifier tout statut opérationnel",
    description: "Dérogation sensible réservée aux responsables autorisés ; toutes les transitions restent auditées.",
    category: "Opérations",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.MANAGE_COMMERCIAL_MATURITY,
    label: "Gérer la maturité commerciale",
    description: "Autorise l’enregistrement contrôlé des preuves et transitions de maturité hors promotion commerciale finale.",
    category: "Maturité commerciale",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.PROMOTE_COMMERCIAL_READY,
    label: "Promouvoir vers COMMERCIAL_READY",
    description: "Autorise la promotion commerciale uniquement lorsque Production, E2E propriétaire et preuves sont présents.",
    category: "Maturité commerciale",
  },
  {
    code: DTSC_SPECIAL_PERMISSIONS.DEGRADE_COMMERCIAL_MATURITY,
    label: "Dégrader la maturité commerciale",
    description: "Autorise une dégradation auditée après preuve d’incident ou de régression critique.",
    category: "Maturité commerciale",
  },
] as const;

export const DTSC_INDIVIDUAL_PERMISSION_CATALOG = [
  ...staticPermissionCatalog,
  ...adminBlocks.map((block) => ({
    code: adminSectionPermission(block.id),
    label: `Accéder à Administration · ${block.label}`,
    description: block.description,
    category: "Administration",
  })),
];

const knownPermissionCodes = new Set(DTSC_INDIVIDUAL_PERMISSION_CATALOG.map((permission) => permission.code));

export function isKnownDtscIndividualPermission(permissionCode: string) {
  return knownPermissionCodes.has(permissionCode);
}

export function buildDtscPermissionGrantKey(input: {
  userId: string;
  permissionCode: string;
  scopeType?: string | null;
  scopeValue?: string | null;
}) {
  return [input.userId, input.permissionCode, input.scopeType || "GLOBAL", input.scopeValue || "*"]
    .map((part) => part.trim().toLowerCase())
    .join(":");
}

export async function resolveDtscIndividualPermissions(userId: string) {
  const now = new Date();
  const grants = await prisma.dtscIndividualPermissionGrant.findMany({
    where: {
      userId,
      revokedAt: null,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    orderBy: [{ effect: "asc" }, { updatedAt: "desc" }],
  });

  const denied = new Set(grants.filter((grant) => grant.effect === "DENY").map((grant) => grant.permissionCode));
  return new Set(grants.filter((grant) => grant.effect === "ALLOW" && !denied.has(grant.permissionCode)).map((grant) => grant.permissionCode));
}

export async function hasDtscIndividualPermission(userId: string, permissionCode: string) {
  const permissions = await resolveDtscIndividualPermissions(userId);
  return permissions.has(permissionCode);
}

export async function canReadAdminSectionByIndividualGrant(userId: string, blockId: AdminBlockId) {
  return hasDtscIndividualPermission(userId, adminSectionPermission(blockId));
}
