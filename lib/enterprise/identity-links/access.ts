import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export type EnterpriseRelationshipCapability =
  | "RELATIONSHIP_SUMMARY"
  | "TARGETED_NOTIFICATIONS"
  | "SHARED_DOCUMENTS"
  | "CUSTOMER_SERVICES"
  | "SUPPLIER_SERVICES"
  | "EMPLOYEE_SERVICES"
  | "COLLABORATOR_SERVICES"
  | "ENTERPRISE_BENEFITS";

export type EnterpriseRelationshipAccessDecision = {
  allowed: boolean;
  code:
    | "ACTIVE_RELATIONSHIP"
    | "RELATIONSHIP_NOT_FOUND"
    | "RELATIONSHIP_NOT_ACTIVE"
    | "USER_MISMATCH"
    | "ORGANIZATION_INACTIVE";
  organizationId: string;
  identityLinkId: string | null;
  relationType: string | null;
  capabilities: EnterpriseRelationshipCapability[];
  message: string;
};

const RELATION_CAPABILITIES: Record<string, EnterpriseRelationshipCapability[]> = {
  PROSPECT: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "CUSTOMER_SERVICES"],
  CUSTOMER: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "CUSTOMER_SERVICES", "ENTERPRISE_BENEFITS"],
  CUSTOMER_CONTACT: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "CUSTOMER_SERVICES"],
  SUPPLIER_REPRESENTATIVE: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "SUPPLIER_SERVICES"],
  EMPLOYEE: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "EMPLOYEE_SERVICES", "ENTERPRISE_BENEFITS"],
  COLLABORATOR: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "COLLABORATOR_SERVICES", "ENTERPRISE_BENEFITS"],
  CONTRACTOR: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "COLLABORATOR_SERVICES"],
  PARTNER: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS", "SHARED_DOCUMENTS", "ENTERPRISE_BENEFITS"],
  OTHER: ["RELATIONSHIP_SUMMARY", "TARGETED_NOTIFICATIONS"],
};

function denied(
  organizationId: string,
  code: EnterpriseRelationshipAccessDecision["code"],
  message: string,
  identityLinkId: string | null = null,
  relationType: string | null = null,
): EnterpriseRelationshipAccessDecision {
  return { allowed: false, code, organizationId, identityLinkId, relationType, capabilities: [], message };
}

export async function resolveEnterpriseIdentityRelationshipAccess({
  userId,
  organizationId,
  identityLinkId,
}: {
  userId: string;
  organizationId: string;
  identityLinkId?: string | null;
}): Promise<EnterpriseRelationshipAccessDecision> {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", organizationType: "CLIENT", deletedAt: null },
    select: { id: true, enterpriseModules: { where: { isEnabled: true }, select: { moduleCode: true } } },
  });
  if (!organization) return denied(organizationId, "ORGANIZATION_INACTIVE", "Cette entreprise n’est pas disponible.");

  const link = await prisma.enterpriseIdentityLink.findFirst({
    where: {
      organizationId,
      ...(identityLinkId ? { id: identityLinkId } : {}),
      userId,
    },
    orderBy: { activatedAt: "desc" },
  });
  if (!link) return denied(organizationId, "RELATIONSHIP_NOT_FOUND", "Aucune relation consentie n’a été trouvée.");
  if (link.userId !== userId) return denied(organizationId, "USER_MISMATCH", "Cette relation appartient à un autre compte.", link.id, link.requestedRelationType);
  if (link.status !== "ACTIVE" || !link.activatedAt || !link.userDecisionAt || !link.organizationDecisionAt) {
    return denied(organizationId, "RELATIONSHIP_NOT_ACTIVE", "La relation doit être active et approuvée avant d’accorder des avantages.", link.id, link.requestedRelationType);
  }

  const entitlements = await getOrganizationEntitlements(organizationId);
  const enabled = new Set(organization.enterpriseModules.map((item) => normalizeEnterpriseModuleCode(item.moduleCode)));
  const allowedEntitlements = new Set((entitlements?.modules || []).filter((item) => item.allowed).map((item) => normalizeEnterpriseModuleCode(item.moduleCode)));
  const capabilities = [...(RELATION_CAPABILITIES[link.requestedRelationType] || RELATION_CAPABILITIES.OTHER)];

  if (!enabled.has("DOCUMENTS") || !allowedEntitlements.has("DOCUMENTS")) {
    const index = capabilities.indexOf("SHARED_DOCUMENTS");
    if (index >= 0) capabilities.splice(index, 1);
  }
  if (!enabled.has("CRM_CUSTOMERS") || !allowedEntitlements.has("CRM_CUSTOMERS")) {
    const index = capabilities.indexOf("CUSTOMER_SERVICES");
    if (index >= 0) capabilities.splice(index, 1);
  }
  if (!enabled.has("SUPPLIERS_PURCHASES") || !allowedEntitlements.has("SUPPLIERS_PURCHASES")) {
    const index = capabilities.indexOf("SUPPLIER_SERVICES");
    if (index >= 0) capabilities.splice(index, 1);
  }
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!membership) {
    for (const capability of ["EMPLOYEE_SERVICES", "COLLABORATOR_SERVICES"] as const) {
      const index = capabilities.indexOf(capability);
      if (index >= 0) capabilities.splice(index, 1);
    }
  }

  return {
    allowed: true,
    code: "ACTIVE_RELATIONSHIP",
    organizationId,
    identityLinkId: link.id,
    relationType: link.requestedRelationType,
    capabilities,
    message: "Les avantages sont résolus depuis la relation active et les services réellement activés.",
  };
}
