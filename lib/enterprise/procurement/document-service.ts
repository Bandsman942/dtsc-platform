import type { z } from "zod";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { prisma } from "@/lib/prisma";
import {
  createEnterpriseDocumentSignedUrl,
  uploadEnterpriseDocumentVersion as uploadPrivateVersion,
} from "@/lib/enterprise/procurement/document-storage";
import {
  addEnterpriseOperationalEvent,
  createEnterpriseLink,
  nullable,
  requireActiveEnterpriseMember,
  requireEnterpriseDepartment,
  requireEnterpriseSourceReference,
} from "@/lib/enterprise/procurement/shared";
import type {
  enterpriseDocumentCreateSchema,
  enterpriseDocumentUpdateSchema,
} from "@/lib/enterprise/procurement/validators";

type CreateDocumentInput = z.infer<typeof enterpriseDocumentCreateSchema>;
type UpdateDocumentInput = z.infer<typeof enterpriseDocumentUpdateSchema>;

function asDate(value?: string | null) {
  return value ? new Date(value) : null;
}

export async function createEnterpriseDocument(organizationId: string, actorUserId: string, input: CreateDocumentInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    if (input.ownerUserId) await requireActiveEnterpriseMember(tx, organizationId, input.ownerUserId);
    await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const source = await requireEnterpriseSourceReference(tx, organizationId, input);
    const document = await tx.enterpriseDocument.create({ data: {
      organizationId,
      title: input.title,
      description: nullable(input.description),
      documentType: input.documentType,
      category: nullable(input.category),
      status: "DRAFT",
      visibility: input.visibility,
      ownerUserId: nullable(input.ownerUserId),
      departmentId: nullable(input.departmentId),
      sourceModule: source?.sourceModule || null,
      sourceEntityType: source?.sourceEntityType || null,
      sourceEntityId: source?.sourceEntityId || null,
      expiresAt: asDate(input.expiresAt),
      createdByUserId: actorUserId,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseDocument", entityId: document.id, eventType: "ENTERPRISE_DOCUMENT_CREATED", summary: "Document créé.", actorUserId, toStatus: document.status });
    if (source) await createEnterpriseLink(tx, { organizationId, sourceModule: source.sourceModule, sourceEntityType: source.sourceEntityType, sourceEntityId: source.sourceEntityId, targetModule: "DOCUMENTS", targetEntityType: "EnterpriseDocument", targetEntityId: document.id, linkType: "DOCUMENTS", createdById: actorUserId });
    return document;
  });
}

export async function updateEnterpriseDocument(organizationId: string, documentId: string, actorUserId: string, input: UpdateDocumentInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseDocument.findFirst({ where: { id: documentId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Document introuvable.", 404, "DOCUMENT_NOT_FOUND");
    if (input.ownerUserId) await requireActiveEnterpriseMember(tx, organizationId, input.ownerUserId);
    if (input.departmentId) await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const visibility = input.visibility || existing.visibility;
    const departmentId = input.departmentId === undefined ? existing.departmentId : nullable(input.departmentId);
    if (visibility === "DEPARTMENT" && !departmentId) throw new EnterpriseCoreV2Error("Un département est obligatoire pour une visibilité départementale.", 400, "DOCUMENT_DEPARTMENT_REQUIRED");
    const updated = await tx.enterpriseDocument.updateMany({
      where: { id: documentId, organizationId, revision: input.revision, archivedAt: null },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
        ...(input.category !== undefined ? { category: nullable(input.category) } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: nullable(input.ownerUserId) } : {}),
        ...(input.departmentId !== undefined ? { departmentId: nullable(input.departmentId) } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: asDate(input.expiresAt) } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le document a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseDocument", entityId: documentId, eventType: "ENTERPRISE_DOCUMENT_UPDATED", summary: "Métadonnées du document mises à jour.", actorUserId, fromStatus: existing.status, toStatus: existing.status });
    return tx.enterpriseDocument.findUnique({ where: { id: documentId } });
  });
}

export async function addEnterpriseDocumentVersion({ organizationId, documentId, actorUserId, revision, file }: { organizationId: string; documentId: string; actorUserId: string; revision: number; file: File }) {
  const document = await prisma.enterpriseDocument.findFirst({ where: { id: documentId, organizationId, archivedAt: null } });
  if (!document) throw new EnterpriseCoreV2Error("Document introuvable.", 404, "DOCUMENT_NOT_FOUND");
  if (document.revision !== revision) throw new EnterpriseCoreV2Error("Le document a été modifié. Actualisez avant d’ajouter une version.", 409, "REVISION_CONFLICT");
  const versionNumber = document.currentVersion + 1;
  const uploaded = await uploadPrivateVersion({ organizationId, documentId, versionNumber, file });
  return prisma.$transaction(async (tx) => {
    const locked = await tx.enterpriseDocument.updateMany({
      where: { id: documentId, organizationId, revision, currentVersion: document.currentVersion, archivedAt: null },
      data: { currentVersion: versionNumber, status: "ACTIVE", updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (locked.count !== 1) throw new EnterpriseCoreV2Error("Une autre version a été ajoutée simultanément.", 409, "DOCUMENT_VERSION_CONFLICT");
    const version = await tx.enterpriseDocumentVersion.create({ data: { organizationId, documentId, versionNumber, ...uploaded, uploadedByUserId: actorUserId } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseDocument", entityId: documentId, eventType: "ENTERPRISE_DOCUMENT_VERSION_UPLOADED", summary: `Version ${versionNumber} ajoutée.`, actorUserId, fromStatus: document.status, toStatus: "ACTIVE", metadata: { versionNumber, checksum: uploaded.checksum } });
    return version;
  });
}

export async function archiveEnterpriseDocument(organizationId: string, documentId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseDocument.findFirst({ where: { id: documentId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Document introuvable.", 404, "DOCUMENT_NOT_FOUND");
    const result = await tx.enterpriseDocument.updateMany({ where: { id: documentId, organizationId, revision, archivedAt: null }, data: { status: "ARCHIVED", archivedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (result.count !== 1) throw new EnterpriseCoreV2Error("Le document a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseDocument", entityId: documentId, eventType: "ENTERPRISE_DOCUMENT_ARCHIVED", summary: "Document archivé.", actorUserId, fromStatus: existing.status, toStatus: "ARCHIVED" });
  });
}

export async function grantEnterpriseDocumentAccess(organizationId: string, documentId: string, actorUserId: string, userId: string, accessLevel: string) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.enterpriseDocument.findFirst({ where: { id: documentId, organizationId, archivedAt: null }, select: { id: true } });
    if (!document) throw new EnterpriseCoreV2Error("Document introuvable.", 404, "DOCUMENT_NOT_FOUND");
    await requireActiveEnterpriseMember(tx, organizationId, userId);
    const access = await tx.enterpriseDocumentAccess.upsert({
      where: { organizationId_documentId_userId: { organizationId, documentId, userId } },
      create: { organizationId, documentId, userId, accessLevel, grantedByUserId: actorUserId },
      update: { accessLevel, grantedByUserId: actorUserId },
    });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseDocument", entityId: documentId, eventType: "ENTERPRISE_DOCUMENT_ACCESS_GRANTED", summary: "Accès documentaire accordé.", actorUserId, metadata: { userId, accessLevel } });
    return access;
  });
}

export async function revokeEnterpriseDocumentAccess(organizationId: string, documentId: string, actorUserId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.enterpriseDocumentAccess.deleteMany({ where: { organizationId, documentId, userId } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseDocument", entityId: documentId, eventType: "ENTERPRISE_DOCUMENT_ACCESS_REVOKED", summary: "Accès documentaire retiré.", actorUserId, metadata: { userId } });
  });
}

export async function getEnterpriseDocumentSignedDownload(organizationId: string, documentId: string, versionId?: string | null) {
  const document = await prisma.enterpriseDocument.findFirst({ where: { id: documentId, organizationId, archivedAt: null } });
  if (!document || document.currentVersion < 1) throw new EnterpriseCoreV2Error("Aucun fichier n’est disponible pour ce document.", 404, "DOCUMENT_FILE_NOT_FOUND");
  const version = versionId
    ? await prisma.enterpriseDocumentVersion.findFirst({ where: { id: versionId, organizationId, documentId } })
    : await prisma.enterpriseDocumentVersion.findFirst({ where: { organizationId, documentId, versionNumber: document.currentVersion } });
  if (!version) throw new EnterpriseCoreV2Error("Version documentaire introuvable.", 404, "DOCUMENT_VERSION_NOT_FOUND");
  const signedUrl = await createEnterpriseDocumentSignedUrl({ organizationId, documentId, storageBucket: version.storageBucket, storagePath: version.storagePath });
  return { document, version, signedUrl, expiresInSeconds: 120 };
}
