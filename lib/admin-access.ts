import type { UserRole } from "@prisma/client";

export const adminBlocks = [
  { id: "overview", label: "Vue d'ensemble", description: "Statistiques générales et synthèse d'activité." },
  { id: "settings", label: "Paramètres globaux", description: "Limites, OTP, maintenance, diffusions et réglages applicatifs." },
  { id: "publications", label: "Publications publiques", description: "Contenus visibles sur la page Ressources." },
  { id: "users", label: "Utilisateurs", description: "Création, rôles, statuts et limites des comptes." },
  { id: "clientOrganizations", label: "Entreprises clientes", description: "Création, activation, abonnements et admins entreprise sans accès aux données privées." },
  { id: "billing", label: "Abonnements & facturation", description: "Suivi des paiements, plans et revenus plateforme." },
  { id: "hrCfo", label: "HR & CFO", description: "Ressources humaines, budgets, dépenses, factures et contrôle interne." },
  { id: "sco", label: "SCO", description: "Fournisseurs, achats, stocks, actifs et logistique opérationnelle." },
  { id: "coo", label: "COO", description: "Opérations internes, tâches, workflows, blocages et performance." },
  { id: "ceo", label: "CEO", description: "Supervision exécutive, objectifs, alertes critiques et journal stratégique." },
  { id: "mpo", label: "MPO", description: "Management des projets, cadrage, livrables, risques et coordination numérique." },
  { id: "cto", label: "CTO", description: "Architecture, développement, APIs, infrastructure, incidents et qualité technique." },
  { id: "la", label: "LA", description: "Dossiers juridiques, contrats, conformité, litiges et archivage confidentiel." },
  { id: "visits", label: "Visites du site", description: "Suivi des visites publiques et filtres de période." },
  { id: "activity", label: "Activité plateforme", description: "Conversations, tickets et tableaux opérationnels." },
  { id: "audits", label: "Audits et logs", description: "Paiements, logs API, webhooks et traces techniques." },
] as const;

export type AdminBlockId = (typeof adminBlocks)[number]["id"];
export type AdminRoleAccess = Record<Exclude<UserRole, "CLIENT">, AdminBlockId[]>;

const defaultAccess: AdminRoleAccess = {
  ADMIN: adminBlocks.map((block) => block.id),
  MANAGER: ["overview", "publications", "clientOrganizations", "billing", "hrCfo", "sco", "coo", "mpo", "cto", "visits", "activity"],
  SUPPORT: ["overview", "activity", "audits"],
};

export function parseAdminRoleAccess(value: unknown): AdminRoleAccess {
  if (!value || typeof value !== "object") {
    return defaultAccess;
  }

  const record = value as Partial<Record<UserRole, unknown>>;
  const validBlockIds = new Set(adminBlocks.map((block) => block.id));

  return {
    ADMIN: defaultAccess.ADMIN,
    MANAGER: Array.isArray(record.MANAGER)
      ? record.MANAGER.filter((item): item is AdminBlockId => typeof item === "string" && validBlockIds.has(item as AdminBlockId))
      : defaultAccess.MANAGER,
    SUPPORT: Array.isArray(record.SUPPORT)
      ? record.SUPPORT.filter((item): item is AdminBlockId => typeof item === "string" && validBlockIds.has(item as AdminBlockId))
      : defaultAccess.SUPPORT,
  };
}

export function canAccessAdminBlock(role: UserRole, blockId: AdminBlockId, access: AdminRoleAccess) {
  if (role === "ADMIN") {
    return true;
  }
  if (role === "CLIENT") {
    return false;
  }

  return access[role].includes(blockId);
}

export function canAccessAdministration(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "SUPPORT";
}
