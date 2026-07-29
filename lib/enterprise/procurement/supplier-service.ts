import type { z } from "zod";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { prisma } from "@/lib/prisma";
import { addEnterpriseOperationalEvent, nullable, requireActiveEnterpriseMember } from "@/lib/enterprise/procurement/shared";
import type {
  enterpriseSupplierActionSchema,
  enterpriseSupplierContactCreateSchema,
  enterpriseSupplierCreateSchema,
  enterpriseSupplierUpdateSchema,
} from "@/lib/enterprise/procurement/validators";

type SupplierCreateInput = z.infer<typeof enterpriseSupplierCreateSchema>;
type SupplierUpdateInput = z.infer<typeof enterpriseSupplierUpdateSchema>;
type SupplierActionInput = z.infer<typeof enterpriseSupplierActionSchema>;
type SupplierContactInput = z.infer<typeof enterpriseSupplierContactCreateSchema>;

export function normalizeEnterpriseSupplierName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export async function createEnterpriseSupplier(organizationId: string, actorUserId: string, input: SupplierCreateInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const supplier = await tx.enterpriseSupplier.create({ data: {
      organizationId,
      legalName: input.legalName,
      displayName: nullable(input.displayName),
      normalizedName: normalizeEnterpriseSupplierName(input.legalName),
      supplierType: nullable(input.supplierType),
      category: nullable(input.category),
      status: input.status,
      email: nullable(input.email),
      phone: nullable(input.phone),
      website: nullable(input.website),
      addressLine: nullable(input.addressLine),
      city: nullable(input.city),
      country: nullable(input.country),
      taxIdentifier: nullable(input.taxIdentifier),
      registrationId: nullable(input.registrationId),
      notes: nullable(input.notes),
      createdByUserId: actorUserId,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseSupplier", entityId: supplier.id, eventType: "ENTERPRISE_SUPPLIER_CREATED", summary: "Fournisseur créé.", actorUserId, toStatus: supplier.status });
    return supplier;
  });
}

export async function updateEnterpriseSupplier(organizationId: string, supplierId: string, actorUserId: string, input: SupplierUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseSupplier.findFirst({ where: { id: supplierId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Fournisseur introuvable.", 404, "SUPPLIER_NOT_FOUND");
    const updated = await tx.enterpriseSupplier.updateMany({
      where: { id: supplierId, organizationId, revision: input.revision, archivedAt: null },
      data: {
        ...(input.legalName !== undefined ? { legalName: input.legalName, normalizedName: normalizeEnterpriseSupplierName(input.legalName) } : {}),
        ...(input.displayName !== undefined ? { displayName: nullable(input.displayName) } : {}),
        ...(input.supplierType !== undefined ? { supplierType: nullable(input.supplierType) } : {}),
        ...(input.category !== undefined ? { category: nullable(input.category) } : {}),
        ...(input.email !== undefined ? { email: nullable(input.email) } : {}),
        ...(input.phone !== undefined ? { phone: nullable(input.phone) } : {}),
        ...(input.website !== undefined ? { website: nullable(input.website) } : {}),
        ...(input.addressLine !== undefined ? { addressLine: nullable(input.addressLine) } : {}),
        ...(input.city !== undefined ? { city: nullable(input.city) } : {}),
        ...(input.country !== undefined ? { country: nullable(input.country) } : {}),
        ...(input.taxIdentifier !== undefined ? { taxIdentifier: nullable(input.taxIdentifier) } : {}),
        ...(input.registrationId !== undefined ? { registrationId: nullable(input.registrationId) } : {}),
        ...(input.notes !== undefined ? { notes: nullable(input.notes) } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le fournisseur a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseSupplier", entityId: supplierId, eventType: "ENTERPRISE_SUPPLIER_UPDATED", summary: "Fournisseur mis à jour.", actorUserId, fromStatus: existing.status, toStatus: existing.status });
    return tx.enterpriseSupplier.findUnique({ where: { id: supplierId } });
  });
}

export async function addEnterpriseSupplierContact(organizationId: string, supplierId: string, actorUserId: string, input: SupplierContactInput) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.enterpriseSupplier.findFirst({ where: { id: supplierId, organizationId, archivedAt: null }, select: { id: true } });
    if (!supplier) throw new EnterpriseCoreV2Error("Fournisseur introuvable.", 404, "SUPPLIER_NOT_FOUND");
    if (input.isPrimary) await tx.enterpriseSupplierContact.updateMany({ where: { organizationId, supplierId, isPrimary: true }, data: { isPrimary: false } });
    const contact = await tx.enterpriseSupplierContact.create({ data: { organizationId, supplierId, name: input.name, title: nullable(input.title), email: nullable(input.email), phone: nullable(input.phone), isPrimary: input.isPrimary } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseSupplier", entityId: supplierId, eventType: "ENTERPRISE_SUPPLIER_CONTACT_ADDED", summary: "Interlocuteur fournisseur ajouté.", actorUserId, metadata: { contactId: contact.id, isPrimary: contact.isPrimary } });
    return contact;
  });
}

export async function transitionEnterpriseSupplier(organizationId: string, supplierId: string, actorUserId: string, input: SupplierActionInput) {
  const targets: Record<SupplierActionInput["action"], { from: string[]; to: string; archive?: boolean }> = {
    ACTIVATE: { from: ["PROSPECT", "SUSPENDED", "INACTIVE"], to: "ACTIVE" },
    SUSPEND: { from: ["ACTIVE"], to: "SUSPENDED" },
    DEACTIVATE: { from: ["PROSPECT", "ACTIVE", "SUSPENDED"], to: "INACTIVE" },
    ARCHIVE: { from: ["PROSPECT", "ACTIVE", "SUSPENDED", "INACTIVE"], to: "INACTIVE", archive: true },
  };
  const transition = targets[input.action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseSupplier.findFirst({ where: { id: supplierId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Fournisseur introuvable.", 404, "SUPPLIER_NOT_FOUND");
    if (!transition.from.includes(existing.status)) throw new EnterpriseCoreV2Error("Cette transition fournisseur n’est pas autorisée.", 409, "INVALID_SUPPLIER_TRANSITION");
    const updated = await tx.enterpriseSupplier.updateMany({
      where: { id: supplierId, organizationId, status: existing.status, revision: input.revision, archivedAt: null },
      data: { status: transition.to, ...(transition.archive ? { archivedAt: new Date() } : {}), notes: input.reason ? `${existing.notes ? `${existing.notes}\n` : ""}${input.reason}` : existing.notes, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le fournisseur a changé simultanément.", 409, "REVISION_CONFLICT");
    const eventType = input.action === "SUSPEND" ? "ENTERPRISE_SUPPLIER_SUSPENDED" : input.action === "ARCHIVE" ? "ENTERPRISE_SUPPLIER_ARCHIVED" : "ENTERPRISE_SUPPLIER_UPDATED";
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseSupplier", entityId: supplierId, eventType, summary: input.reason || `Action ${input.action} appliquée au fournisseur.`, actorUserId, fromStatus: existing.status, toStatus: transition.to });
    return tx.enterpriseSupplier.findUnique({ where: { id: supplierId } });
  });
}
