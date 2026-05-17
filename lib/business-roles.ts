import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessAdminBlock, parseAdminRoleAccess, type AdminBlockId, type AdminRoleAccess } from "@/lib/admin-access";

export const businessRoleCodes = {
  CEO: "CEO",
  COO: "COO",
  CTO: "CTO",
  SCO: "SCO",
  MPO: "MPO",
  LA: "LA",
  HR_CFO: "HR_CFO",
} as const;

export type BusinessRoleCode = keyof typeof businessRoleCodes;

export const defaultDtscPositions = [
  { id: "pos-ceo", title: "CEO", code: "CEO", hierarchyLevel: 1, permissions: "CEO_SUPERVISION", description: "Direction générale, supervision stratégique et arbitrage exécutif." },
  { id: "pos-coo", title: "COO", code: "COO", hierarchyLevel: 2, permissions: "COO_OPERATIONS", description: "Pilotage opérationnel, coordination interne, tâches, workflows et blocages." },
  { id: "pos-cto", title: "CTO", code: "CTO", hierarchyLevel: 3, permissions: "CTO_TECH", description: "Direction technique, architecture, cybersécurité et delivery technologique." },
  { id: "pos-sco", title: "SCO", code: "SCO", hierarchyLevel: 3, permissions: "SCO_SUPPLY_CHAIN", description: "Supply Chain Officer: achats, fournisseurs, stocks, inventaires, matériels et logistique." },
  { id: "pos-mpo", title: "MPO", code: "MPO", hierarchyLevel: 4, permissions: "MPO_PROJECTS", description: "Management & Projects Officer: portefeuille projets, cadrage, livrables, risques et coordination numérique." },
  { id: "pos-la", title: "Legal Advisor", code: "LA", hierarchyLevel: 3, permissions: "LA_LEGAL", description: "Conseil juridique, contrats, conformité, litiges, archivage et confidentialité." },
  { id: "pos-hr-cfo", title: "RH & CFO", code: "HR_CFO", hierarchyLevel: 3, permissions: "HR_CFO_FINANCE", description: "Ressources humaines, finances, budgets, transactions, paie et contrôle." },
  { id: "pos-hr-manager", title: "Responsable RH", code: "HR_MANAGER", hierarchyLevel: 5, permissions: "HR_MANAGEMENT", description: "Suivi administratif RH, conformité et dossiers collaborateurs." },
  { id: "pos-finance-manager", title: "Responsable Finance", code: "FINANCE_MANAGER", hierarchyLevel: 5, permissions: "FINANCE_MANAGEMENT", description: "Suivi financier, paiements, budgets et contrôle interne." },
  { id: "pos-commercial-manager", title: "Responsable Commercial", code: "COMMERCIAL_MANAGER", hierarchyLevel: 5, permissions: "COMMERCIAL_MANAGEMENT", description: "Prospection, relation client, offres et ventes." },
  { id: "pos-technical-manager", title: "Responsable Technique", code: "TECHNICAL_MANAGER", hierarchyLevel: 5, permissions: "TECHNICAL_MANAGEMENT", description: "Encadrement technique, qualité et livraisons numériques." },
  { id: "pos-marketing-manager", title: "Responsable Marketing", code: "MARKETING_MANAGER", hierarchyLevel: 5, permissions: "MARKETING_MANAGEMENT", description: "Campagnes, contenus, visibilité et acquisition." },
  { id: "pos-support-manager", title: "Responsable Support Client", code: "SUPPORT_MANAGER", hierarchyLevel: 5, permissions: "SUPPORT_MANAGEMENT", description: "Support, tickets, satisfaction et résolution client." },
  { id: "pos-collaborator", title: "Collaborateur", code: "COLLABORATOR", hierarchyLevel: 10, permissions: "COLLABORATION", description: "Collaborateur interne DTSC impliqué dans les activités assignées." },
  { id: "pos-consultant", title: "Consultant", code: "CONSULTANT", hierarchyLevel: 10, permissions: "CONSULTING", description: "Consultant DTSC pour les missions clients, data, IA et transformation." },
  { id: "pos-admin-assistant", title: "Assistant Administratif", code: "ADMIN_ASSISTANT", hierarchyLevel: 10, permissions: "ADMIN_ASSISTANCE", description: "Assistance administrative, suivi documentaire et coordination." },
  { id: "pos-operations-agent", title: "Agent Opérationnel", code: "OPERATIONS_AGENT", hierarchyLevel: 10, permissions: "OPERATIONS_EXECUTION", description: "Exécution opérationnelle, logistique et suivi quotidien." },
] as const;

export function normalizePositionCode(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function ensureDefaultPositions() {
  for (const position of defaultDtscPositions) {
    await prisma.dtscPosition.upsert({
      where: { code: position.code },
      update: {
        title: position.title,
        description: position.description,
        hierarchyLevel: position.hierarchyLevel,
        permissions: position.permissions,
      },
      create: {
        id: position.id,
        title: position.title,
        code: position.code,
        description: position.description,
        hierarchyLevel: position.hierarchyLevel,
        permissions: position.permissions,
      },
    });
  }
}

export async function getCollaboratorBusinessContext(userId: string) {
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId, status: { not: "EXITED" } },
    include: { position: true },
  });
  if (!employee) {
    return { employee: null, positionCode: null, businessRoles: [] as string[] };
  }

  const positionCode = normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle);
  const businessRoles = positionCode ? [positionCode] : [];
  return { employee, positionCode, businessRoles };
}

export async function hasBusinessRole(userId: string, roles: string[]) {
  const context = await getCollaboratorBusinessContext(userId);
  return roles.some((role) => context.businessRoles.some((current) => current === normalizePositionCode(role)));
}

export async function canAccessAdminBlockByPosition(userId: string, role: UserRole, blockId: AdminBlockId) {
  if (role === UserRole.ADMIN) {
    return true;
  }
  const context = await getCollaboratorBusinessContext(userId);
  return adminBlockMatchesOfficialPosition(blockId, context.positionCode);
}

const sensitiveAdminBlockPositions: Partial<Record<AdminBlockId, BusinessRoleCode>> = {
  hrCfo: "HR_CFO",
  sco: "SCO",
  coo: "COO",
  ceo: "CEO",
  mpo: "MPO",
  cto: "CTO",
  la: "LA",
};

export function adminBlockMatchesOfficialPosition(blockId: AdminBlockId, positionCode: string | null) {
  const requiredPosition = sensitiveAdminBlockPositions[blockId];
  if (!requiredPosition) {
    return true;
  }

  return normalizePositionCode(positionCode) === requiredPosition;
}

export function isSensitiveAdminBlock(blockId: AdminBlockId) {
  return Boolean(sensitiveAdminBlockPositions[blockId]);
}

export async function canAccessAdminSection(user: { id: string; role: UserRole }, blockId: AdminBlockId, accessInput?: AdminRoleAccess | unknown) {
  if (user.role === UserRole.ADMIN) {
    return true;
  }
  if (user.role === UserRole.CLIENT) {
    return false;
  }

  const access = accessInput && typeof accessInput === "object" && "MANAGER" in accessInput
    ? accessInput as AdminRoleAccess
    : parseAdminRoleAccess(accessInput);
  const hasRoleAccess = canAccessAdminBlock(user.role, blockId, access);
  if (!hasRoleAccess) {
    return false;
  }
  if (!isSensitiveAdminBlock(blockId)) {
    return true;
  }

  const context = await getCollaboratorBusinessContext(user.id);
  return adminBlockMatchesOfficialPosition(blockId, context.positionCode);
}
