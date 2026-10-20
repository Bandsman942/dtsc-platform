/** Rôles ordinaires attribuables depuis Administration entreprise.
 * Les rôles privilégiés sont exclusivement gérés par les grants de la Console DTSC.
 */
export const ENTERPRISE_INVITABLE_ROLES = ["MANAGER", "MEMBER", "GUEST"] as const;

export const ENTERPRISE_INVITABLE_ROLE_OPTIONS = [
  { value: "MANAGER", labelFr: "Responsable", labelEn: "Manager" },
  { value: "MEMBER", labelFr: "Collaborateur", labelEn: "Collaborator" },
  { value: "GUEST", labelFr: "Invité", labelEn: "Guest" },
] as const;

export const ENTERPRISE_PRIVILEGED_ROLES = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"] as const;

export function isEnterpriseInvitableRole(value: string): value is (typeof ENTERPRISE_INVITABLE_ROLES)[number] {
  return ENTERPRISE_INVITABLE_ROLES.some((role) => role === value);
}

export function isEnterprisePrivilegedRole(value: string): boolean {
  return ENTERPRISE_PRIVILEGED_ROLES.some((role) => role === value);
}
