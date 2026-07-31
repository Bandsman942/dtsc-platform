import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertActiveOrganizationMember, operationsReference, publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import type {
  assetAssignmentCreateSchema,
  assetCategoryCreateSchema,
  assetCreateSchema,
  assetIncidentCreateSchema,
  assetIncidentResolveSchema,
  assetMaintenanceCreateSchema,
  assetMaintenanceTransitionSchema,
  assetReturnSchema,
} from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";

type AssetCategoryCreateInput = z.infer<typeof assetCategoryCreateSchema>;
type AssetCreateInput = z.infer<typeof assetCreateSchema>;
type AssetAssignmentCreateInput = z.infer<typeof assetAssignmentCreateSchema>;
type AssetReturnInput = z.infer<typeof assetReturnSchema>;
type AssetMaintenanceCreateInput = z.infer<typeof assetMaintenanceCreateSchema>;
type AssetMaintenanceTransitionInput = z.infer<typeof assetMaintenanceTransitionSchema>;
type AssetIncidentCreateInput = z.infer<typeof assetIncidentCreateSchema>;
type AssetIncidentResolveInput = z.infer<typeof assetIncidentResolveSchema>;

export async function createEnterpriseAssetCategory(
  organizationId: string,
  actorUserId: string,
  input: AssetCategoryCreateInput,
) {
  return prisma.enterpriseAssetCategory.create({
    data: {
      organizationId,
      code: input.code,
      name: input.name,
      description: input.description || null,
      createdByUserId: actorUserId,
    },
  });
}

export async function createEnterpriseAsset(
  organizationId: string,
  actorUserId: string,
  input: AssetCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const [category, site, storageLocation, employee, supplier] = await Promise.all([
      input.categoryId
        ? tx.enterpriseAssetCategory.findFirst({ where: { id: input.categoryId, organizationId, archivedAt: null, status: "ACTIVE" }, select: { id: true } })
        : Promise.resolve(null),
      input.siteId
        ? tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, archivedAt: null, status: "ACTIVE" }, select: { id: true } })
        : Promise.resolve(null),
      input.storageLocationId
        ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, archivedAt: null, status: "ACTIVE" }, select: { id: true, warehouse: { select: { siteId: true } } } })
        : Promise.resolve(null),
      input.responsibleEmployeeId
        ? tx.enterpriseEmployee.findFirst({ where: { id: input.responsibleEmployeeId, organizationId, archivedAt: null, employmentStatus: "ACTIVE" }, select: { id: true } })
        : Promise.resolve(null),
      input.supplierId
        ? tx.enterpriseSupplier.findFirst({ where: { id: input.supplierId, organizationId, archivedAt: null }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (input.categoryId && !category) throw new EnterpriseDomainError("ASSET_CATEGORY_NOT_FOUND", 404);
    if (input.siteId && !site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);
    if (input.storageLocationId && !storageLocation) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
    if (input.siteId && storageLocation?.warehouse.siteId && storageLocation.warehouse.siteId !== input.siteId) {
      throw new EnterpriseDomainError("ASSET_LOCATION_SITE_MISMATCH", 409);
    }
    if (input.responsibleEmployeeId && !employee) throw new EnterpriseDomainError("EMPLOYEE_NOT_FOUND", 404);
    if (input.supplierId && !supplier) throw new EnterpriseDomainError("SUPPLIER_NOT_FOUND", 404);

    const asset = await tx.enterpriseAsset.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        description: input.description || null,
        categoryId: input.categoryId || null,
        serialNumber: input.serialNumber || null,
        siteId: input.siteId || null,
        storageLocationId: input.storageLocationId || null,
        responsibleEmployeeId: input.responsibleEmployeeId || null,
        supplierId: input.supplierId || null,
        purchaseId: input.purchaseId || null,
        acquisitionDate: input.acquisitionDate || null,
        indicativeValue: input.indicativeValue ?? null,
        currency: input.currency || null,
        status: "ACTIVE",
        condition: input.condition,
        warrantyEndsAt: input.warrantyEndsAt || null,
        notes: input.notes || null,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseAsset",
      entityId: asset.id,
      eventType: "ASSET_CREATED",
      summary: `Actif ${asset.code} créé`,
      actorUserId,
      toStatus: asset.status,
    });
    return asset;
  });
}

export async function assignEnterpriseAsset(
  organizationId: string,
  assetId: string,
  actorUserId: string,
  input: AssetAssignmentCreateInput,
) {
  if (input.expectedReturnAt && input.expectedReturnAt < input.assignedAt) {
    throw new EnterpriseDomainError("ASSET_ASSIGNMENT_DATE_RANGE_INVALID");
  }
  return prisma.$transaction(async (tx) => {
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: assetId, organizationId, archivedAt: null, status: "ACTIVE" } });
    if (!asset) throw new EnterpriseDomainError("ASSET_NOT_AVAILABLE", 409);
    const existing = await tx.enterpriseAssetAssignment.findFirst({ where: { organizationId, assetId, status: "ACTIVE" }, select: { id: true } });
    if (existing) throw new EnterpriseDomainError("ASSET_ALREADY_ASSIGNED", 409);
    if (input.employeeId) {
      const employee = await tx.enterpriseEmployee.findFirst({ where: { id: input.employeeId, organizationId, archivedAt: null, employmentStatus: "ACTIVE" }, select: { id: true } });
      if (!employee) throw new EnterpriseDomainError("EMPLOYEE_NOT_FOUND", 404);
    }
    if (input.departmentId) {
      const department = await tx.enterpriseDepartment.findFirst({ where: { id: input.departmentId, organizationId, isActive: true }, select: { id: true } });
      if (!department) throw new EnterpriseDomainError("DEPARTMENT_NOT_FOUND", 404);
    }
    const assignment = await tx.enterpriseAssetAssignment.create({
      data: {
        organizationId,
        assetId,
        employeeId: input.employeeId || null,
        departmentId: input.departmentId || null,
        assignedAt: input.assignedAt,
        expectedReturnAt: input.expectedReturnAt || null,
        initialCondition: input.initialCondition,
        assignedByUserId: actorUserId,
        notes: input.notes || null,
      },
    });
    await tx.enterpriseAsset.update({
      where: { id: asset.id },
      data: {
        status: "ASSIGNED",
        responsibleEmployeeId: input.employeeId || null,
        condition: input.initialCondition,
        revision: { increment: 1 },
      },
    });
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseAsset", entityId: asset.id, eventType: "ASSET_ASSIGNED", summary: `Actif ${asset.code} affecté`, actorUserId, fromStatus: "ACTIVE", toStatus: "ASSIGNED", metadataJson: { assignmentId: assignment.id } });
    return assignment;
  });
}

export async function returnEnterpriseAsset(
  organizationId: string,
  assignmentId: string,
  actorUserId: string,
  input: AssetReturnInput,
) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.enterpriseAssetAssignment.findFirst({
      where: { id: assignmentId, organizationId, status: "ACTIVE" },
      include: { asset: true },
    });
    if (!assignment) throw new EnterpriseDomainError("ASSET_ASSIGNMENT_NOT_FOUND", 404);
    const updated = await tx.enterpriseAssetAssignment.updateMany({
      where: { id: assignment.id, organizationId, status: "ACTIVE", revision: input.revision },
      data: {
        status: "RETURNED",
        returnedAt: input.returnedAt,
        returnCondition: input.returnCondition,
        returnedByUserId: actorUserId,
        notes: input.notes || assignment.notes,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseAsset.update({
      where: { id: assignment.assetId },
      data: {
        status: "ACTIVE",
        responsibleEmployeeId: null,
        condition: input.returnCondition,
        revision: { increment: 1 },
      },
    });
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseAsset", entityId: assignment.assetId, eventType: "ASSET_RETURNED", summary: `Actif ${assignment.asset.code} retourné`, actorUserId, fromStatus: "ASSIGNED", toStatus: "ACTIVE", metadataJson: { assignmentId: assignment.id } });
    return tx.enterpriseAssetAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
  });
}

export async function createEnterpriseAssetMaintenance(
  organizationId: string,
  assetId: string,
  actorUserId: string,
  input: AssetMaintenanceCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: assetId, organizationId, archivedAt: null }, select: { id: true, code: true } });
    if (!asset) throw new EnterpriseDomainError("ASSET_NOT_FOUND", 404);
    if (input.responsibleUserId) await assertActiveOrganizationMember(tx, organizationId, input.responsibleUserId);
    if (input.supplierId) {
      const supplier = await tx.enterpriseSupplier.findFirst({ where: { id: input.supplierId, organizationId, archivedAt: null }, select: { id: true } });
      if (!supplier) throw new EnterpriseDomainError("SUPPLIER_NOT_FOUND", 404);
    }
    const maintenance = await tx.enterpriseAssetMaintenance.create({
      data: {
        organizationId,
        assetId,
        reference: operationsReference("MNT"),
        maintenanceType: input.maintenanceType,
        title: input.title,
        description: input.description || null,
        priority: input.priority,
        responsibleUserId: input.responsibleUserId || null,
        supplierId: input.supplierId || null,
        plannedAt: input.plannedAt || null,
        dueAt: input.dueAt || null,
        indicativeCost: input.indicativeCost ?? null,
        currency: input.currency || null,
        notes: input.notes || null,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseAssetMaintenance", entityId: maintenance.id, eventType: "ASSET_MAINTENANCE_CREATED", summary: `Maintenance ${maintenance.reference} créée pour ${asset.code}`, actorUserId, toStatus: maintenance.status });
    return maintenance;
  });
}

export async function transitionEnterpriseAssetMaintenance(
  organizationId: string,
  maintenanceId: string,
  actorUserId: string,
  input: AssetMaintenanceTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const maintenance = await tx.enterpriseAssetMaintenance.findFirst({ where: { id: maintenanceId, organizationId, archivedAt: null }, include: { asset: true } });
    if (!maintenance) throw new EnterpriseDomainError("ASSET_MAINTENANCE_NOT_FOUND", 404);
    const allowed = maintenance.status === "PLANNED"
      ? ["START", "CANCEL"]
      : maintenance.status === "IN_PROGRESS"
        ? ["COMPLETE", "CANCEL"]
        : [];
    if (!allowed.includes(input.action)) throw new EnterpriseDomainError("ASSET_MAINTENANCE_TRANSITION_INVALID", 409);
    const now = new Date();
    const targetStatus = input.action === "START" ? "IN_PROGRESS" : input.action === "COMPLETE" ? "COMPLETED" : "CANCELLED";
    const updated = await tx.enterpriseAssetMaintenance.updateMany({
      where: { id: maintenance.id, organizationId, status: maintenance.status, revision: input.revision },
      data: {
        status: targetStatus,
        startedAt: input.action === "START" ? now : maintenance.startedAt,
        completedAt: input.action === "COMPLETE" ? now : maintenance.completedAt,
        cancelledAt: input.action === "CANCEL" ? now : maintenance.cancelledAt,
        cancellationReason: input.action === "CANCEL" ? input.comment || "Maintenance annulée" : maintenance.cancellationReason,
        notes: input.comment || maintenance.notes,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseAsset.update({
      where: { id: maintenance.assetId },
      data: {
        status: input.action === "START" ? "MAINTENANCE" : "ACTIVE",
        revision: { increment: 1 },
      },
    });
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseAssetMaintenance", entityId: maintenance.id, eventType: `ASSET_MAINTENANCE_${targetStatus}`, summary: `Maintenance ${maintenance.reference}: ${maintenance.status} → ${targetStatus}`, actorUserId, fromStatus: maintenance.status, toStatus: targetStatus });
    return tx.enterpriseAssetMaintenance.findUniqueOrThrow({ where: { id: maintenance.id } });
  });
}

export async function createEnterpriseAssetIncident(
  organizationId: string,
  assetId: string,
  actorUserId: string,
  input: AssetIncidentCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: assetId, organizationId, archivedAt: null }, select: { id: true, code: true } });
    if (!asset) throw new EnterpriseDomainError("ASSET_NOT_FOUND", 404);
    if (input.responsibleUserId) await assertActiveOrganizationMember(tx, organizationId, input.responsibleUserId);
    const incident = await tx.enterpriseAssetIncident.create({
      data: {
        organizationId,
        assetId,
        reference: operationsReference("AIN"),
        incidentType: input.incidentType,
        title: input.title,
        description: input.description,
        severity: input.severity,
        reportedByUserId: actorUserId,
        responsibleUserId: input.responsibleUserId || null,
        occurredAt: input.occurredAt || null,
      },
    });
    if (["HIGH", "CRITICAL"].includes(input.severity)) {
      await tx.enterpriseAsset.update({ where: { id: assetId }, data: { status: "OUT_OF_SERVICE", revision: { increment: 1 } } });
    }
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseAssetIncident", entityId: incident.id, eventType: "ASSET_INCIDENT_REPORTED", summary: `Incident ${incident.reference} déclaré sur ${asset.code}`, actorUserId, toStatus: incident.status, metadataJson: { severity: input.severity } });
    return incident;
  });
}

export async function resolveEnterpriseAssetIncident(
  organizationId: string,
  incidentId: string,
  actorUserId: string,
  input: AssetIncidentResolveInput,
) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.enterpriseAssetIncident.findFirst({ where: { id: incidentId, organizationId, status: "OPEN", archivedAt: null }, include: { asset: true } });
    if (!incident) throw new EnterpriseDomainError("ASSET_INCIDENT_NOT_FOUND", 404);
    const updated = await tx.enterpriseAssetIncident.updateMany({
      where: { id: incident.id, organizationId, status: "OPEN", revision: input.revision },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolution: input.resolution, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    const otherOpen = await tx.enterpriseAssetIncident.count({ where: { organizationId, assetId: incident.assetId, status: "OPEN", archivedAt: null, id: { not: incident.id } } });
    if (otherOpen === 0 && incident.asset.status === "OUT_OF_SERVICE") {
      await tx.enterpriseAsset.update({ where: { id: incident.assetId }, data: { status: "ACTIVE", revision: { increment: 1 } } });
    }
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseAssetIncident", entityId: incident.id, eventType: "ASSET_INCIDENT_RESOLVED", summary: `Incident ${incident.reference} résolu`, actorUserId, fromStatus: "OPEN", toStatus: "RESOLVED" });
    return tx.enterpriseAssetIncident.findUniqueOrThrow({ where: { id: incident.id } });
  });
}
