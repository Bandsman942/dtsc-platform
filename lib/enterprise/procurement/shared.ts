import { Prisma } from "@prisma/client";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";

export type ProcurementTransaction = Prisma.TransactionClient;

export function nullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function requireActiveEnterpriseMember(tx: ProcurementTransaction, organizationId: string, userId: string) {
  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { userId: true },
  });
  if (!member) throw new EnterpriseCoreV2Error("Le collaborateur sélectionné n’est pas un membre actif de cette entreprise.", 400, "INVALID_ENTERPRISE_MEMBER");
}

export async function requireEnterpriseDepartment(tx: ProcurementTransaction, organizationId: string, departmentId?: string | null) {
  const id = nullable(departmentId);
  if (!id) return null;
  const department = await tx.enterpriseDepartment.findFirst({ where: { id, organizationId, isActive: true }, select: { id: true } });
  if (!department) throw new EnterpriseCoreV2Error("Le département sélectionné n’appartient pas à cette entreprise ou n’est plus actif.", 400, "INVALID_ENTERPRISE_DEPARTMENT");
  return department.id;
}

export async function enterpriseSourceEntityExists(tx: ProcurementTransaction, organizationId: string, entityType: string, entityId: string) {
  if (entityType === "EnterpriseTask") return Boolean(await tx.enterpriseTask.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseRequest") return Boolean(await tx.enterpriseRequest.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseApproval") return Boolean(await tx.enterpriseApproval.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseMeeting") return Boolean(await tx.enterpriseMeeting.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseMeetingDecision") return Boolean(await tx.enterpriseMeetingDecision.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseDocument") return Boolean(await tx.enterpriseDocument.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseSupplier") return Boolean(await tx.enterpriseSupplier.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterprisePurchase") return Boolean(await tx.enterprisePurchase.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseBudget") return Boolean(await tx.enterpriseBudget.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseBudgetLine") return Boolean(await tx.enterpriseBudgetLine.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseExpense") return Boolean(await tx.enterpriseExpense.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseReport") return Boolean(await tx.enterpriseReport.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseActivityRequest") return Boolean(await tx.enterpriseActivityRequest.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "PharmacySupplier") return Boolean(await tx.pharmacySupplier.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "PharmacyPurchaseOrder") return Boolean(await tx.pharmacyPurchaseOrder.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "PharmacyReceipt") return Boolean(await tx.pharmacyReceipt.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "PharmacyQualityIncident") return Boolean(await tx.pharmacyQualityIncident.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthPatient") return Boolean(await tx.healthPatient.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthAppointment") return Boolean(await tx.healthAppointment.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthConsultation") return Boolean(await tx.healthConsultation.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthDocument") return Boolean(await tx.healthDocument.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthQualityIncident") return Boolean(await tx.healthQualityIncident.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  return false;
}

export async function requireEnterpriseSourceReference(
  tx: ProcurementTransaction,
  organizationId: string,
  source: { sourceModule?: string | null; sourceEntityType?: string | null; sourceEntityId?: string | null }
) {
  const sourceModule = nullable(source.sourceModule);
  const sourceEntityType = nullable(source.sourceEntityType);
  const sourceEntityId = nullable(source.sourceEntityId);
  const count = [sourceModule, sourceEntityType, sourceEntityId].filter(Boolean).length;
  if (count === 0) return null;
  if (count !== 3 || !sourceModule || !sourceEntityType || !sourceEntityId) throw new EnterpriseCoreV2Error("La référence source doit préciser le module, le type et l’identifiant.", 400, "INCOMPLETE_SOURCE_REFERENCE");
  if (!(await enterpriseSourceEntityExists(tx, organizationId, sourceEntityType, sourceEntityId))) throw new EnterpriseCoreV2Error("L’objet source est introuvable dans cette entreprise.", 400, "CROSS_TENANT_SOURCE_DENIED");
  return { sourceModule, sourceEntityType, sourceEntityId };
}

export async function createEnterpriseLink(
  tx: ProcurementTransaction,
  data: {
    organizationId: string;
    sourceModule: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetModule: string;
    targetEntityType: string;
    targetEntityId: string;
    linkType: string;
    createdById: string;
    label?: string | null;
  }
) {
  if (!(await enterpriseSourceEntityExists(tx, data.organizationId, data.sourceEntityType, data.sourceEntityId))) throw new EnterpriseCoreV2Error("La source du lien n’appartient pas à cette entreprise.", 400, "CROSS_TENANT_LINK_DENIED");
  if (!(await enterpriseSourceEntityExists(tx, data.organizationId, data.targetEntityType, data.targetEntityId))) throw new EnterpriseCoreV2Error("La cible du lien n’appartient pas à cette entreprise.", 400, "CROSS_TENANT_LINK_DENIED");
  try {
    return await tx.enterpriseEntityLink.create({ data: { ...data, label: nullable(data.label) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

export async function addEnterpriseOperationalEvent(
  tx: ProcurementTransaction,
  data: {
    organizationId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    summary: string;
    actorUserId: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return tx.enterpriseOperationalEvent.create({ data: {
    organizationId: data.organizationId,
    entityType: data.entityType,
    entityId: data.entityId,
    eventType: data.eventType,
    summary: data.summary,
    actorUserId: data.actorUserId,
    fromStatus: nullable(data.fromStatus),
    toStatus: nullable(data.toStatus),
    metadataJson: data.metadata,
  } });
}
