import { createEnterpriseCoreRecord, type EnterpriseCoreModuleCode } from "@/lib/enterprise/enterprise-core";
import { isDedicatedCoreDomain } from "@/lib/enterprise/core-v2/constants";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseRequest, createEnterpriseTask } from "@/lib/enterprise/core-v2/service";
import { createEnterpriseDocument } from "@/lib/enterprise/procurement/document-service";
import { createEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { createEnterpriseSupplier } from "@/lib/enterprise/procurement/supplier-service";
import { enterpriseDocumentCreateSchema, enterprisePurchaseCreateSchema, enterpriseSupplierCreateSchema } from "@/lib/enterprise/procurement/validators";

export type EnterpriseOperationalObjectInput = {
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

function dedicatedPayloadError(domain: string) {
  return new EnterpriseCoreV2Error(`Le domaine ${domain} utilise désormais son API métier dédiée et exige ses champs structurés.`, 409, "DEDICATED_DOMAIN_REQUIRED");
}

export async function createEnterpriseOperationalObject({ organizationId, actorUserId, data }: { organizationId: string; actorUserId: string; data: EnterpriseOperationalObjectInput }) {
  if (data.moduleCode === "TASKS_OPERATIONS" && (data.recordType === "TASK" || data.recordType === "OPERATION")) {
    return { kind: "TASK" as const, record: await createEnterpriseTask(organizationId, actorUserId, { taskType: data.recordType, title: data.title, description: data.description, priority: data.priority, assignedToUserId: data.assignedToUserId, departmentId: data.departmentId, dueAt: data.dueAt, sourceModule: data.sourceModule, sourceEntityType: data.sourceEntityType, sourceEntityId: data.sourceEntityId }) };
  }
  if (data.moduleCode === "INTERNAL_REQUESTS" && data.recordType === "INTERNAL_REQUEST") {
    return { kind: "REQUEST" as const, record: await createEnterpriseRequest(organizationId, actorUserId, { requestType: typeof data.metadata?.requestType === "string" ? data.metadata.requestType : "GENERAL", title: data.title, description: data.description || data.title, priority: data.priority, assignedToUserId: data.assignedToUserId, departmentId: data.departmentId, dueAt: data.dueAt, sourceModule: data.sourceModule, sourceEntityType: data.sourceEntityType, sourceEntityId: data.sourceEntityId, initialStatus: "SUBMITTED" }) };
  }
  if (data.moduleCode === "DOCUMENTS" && data.recordType === "DOCUMENT") {
    const parsed = enterpriseDocumentCreateSchema.safeParse({ title: data.title, description: data.description || "", documentType: typeof data.metadata?.documentType === "string" ? data.metadata.documentType : "GENERAL", category: typeof data.metadata?.category === "string" ? data.metadata.category : "", visibility: typeof data.metadata?.visibility === "string" ? data.metadata.visibility : "ORGANIZATION", ownerUserId: typeof data.metadata?.ownerUserId === "string" ? data.metadata.ownerUserId : "", departmentId: data.departmentId || "", sourceModule: data.sourceModule || "", sourceEntityType: data.sourceEntityType || "", sourceEntityId: data.sourceEntityId || "", expiresAt: data.dueAt?.toISOString() || "" });
    if (!parsed.success) throw dedicatedPayloadError("DOCUMENT");
    return { kind: "DOCUMENT" as const, record: await createEnterpriseDocument(organizationId, actorUserId, parsed.data) };
  }
  if (data.moduleCode === "SUPPLIERS_PURCHASES" && data.recordType === "SUPPLIER") {
    const parsed = enterpriseSupplierCreateSchema.safeParse({ legalName: data.title, displayName: data.description || "", supplierType: typeof data.metadata?.supplierType === "string" ? data.metadata.supplierType : "", category: typeof data.metadata?.category === "string" ? data.metadata.category : "", status: typeof data.metadata?.status === "string" ? data.metadata.status : "PROSPECT", email: typeof data.metadata?.email === "string" ? data.metadata.email : "", phone: typeof data.metadata?.phone === "string" ? data.metadata.phone : "", website: typeof data.metadata?.website === "string" ? data.metadata.website : "", addressLine: typeof data.metadata?.addressLine === "string" ? data.metadata.addressLine : "", city: typeof data.metadata?.city === "string" ? data.metadata.city : "", country: typeof data.metadata?.country === "string" ? data.metadata.country : "", taxIdentifier: typeof data.metadata?.taxIdentifier === "string" ? data.metadata.taxIdentifier : "", registrationId: typeof data.metadata?.registrationId === "string" ? data.metadata.registrationId : "", notes: typeof data.metadata?.notes === "string" ? data.metadata.notes : "" });
    if (!parsed.success) throw dedicatedPayloadError("SUPPLIER");
    return { kind: "SUPPLIER" as const, record: await createEnterpriseSupplier(organizationId, actorUserId, parsed.data) };
  }
  if (data.moduleCode === "SUPPLIERS_PURCHASES" && data.recordType === "PURCHASE") {
    const parsed = enterprisePurchaseCreateSchema.safeParse({ title: data.title, description: data.description || "", priority: data.priority, supplierId: typeof data.metadata?.supplierId === "string" ? data.metadata.supplierId : "", buyerUserId: data.assignedToUserId || "", departmentId: data.departmentId || "", requestId: typeof data.metadata?.requestId === "string" ? data.metadata.requestId : "", currency: data.currency || "USD", expectedAt: data.dueAt?.toISOString() || "", sourceModule: data.sourceModule || "", sourceEntityType: data.sourceEntityType || "", sourceEntityId: data.sourceEntityId || "", items: Array.isArray(data.metadata?.items) ? data.metadata.items : [] });
    if (!parsed.success) throw dedicatedPayloadError("PURCHASE");
    return { kind: "PURCHASE" as const, record: await createEnterprisePurchase(organizationId, actorUserId, parsed.data) };
  }
  if (isDedicatedCoreDomain(data.moduleCode, data.recordType)) throw dedicatedPayloadError(data.recordType);
  return { kind: "LEGACY" as const, record: await createEnterpriseCoreRecord({ organizationId, actorUserId, data }) };
}
