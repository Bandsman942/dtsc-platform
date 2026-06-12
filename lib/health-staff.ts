import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { healthStaffCreateSchema } from "@/lib/health-staff-validators";

type StaffInput = z.infer<typeof healthStaffCreateSchema>;
const nil = (value?: string) => value?.trim() || null;

export const HEALTH_STAFF_PERMISSIONS = ["health.staff.view","health.staff.create","health.staff.update","health.staff.archive","health.staff.suspend","health.staff.manage_availability","health.staff.manage_permissions","health.staff.view_permissions","health.staff.view_activity","health.staff.manage_specialties","health.patients.view","health.appointments.view","health.appointments.update","health.consultations.view","health.consultations.view_sensitive","health.medical_records.view","health.medical_records.view_sensitive","health.medical_records.confidential_notes","health.laboratory.view","health.internal_pharmacy.view","health.medical_billing.view","health.reports.view"] as const;

export async function validateHealthStaffReferences(organizationId: string, data: Partial<StaffInput>, existingMemberId?: string) {
  const organizationMemberId = data.organizationMemberId || existingMemberId;
  const [member, position, department, specialty, supervisor] = await Promise.all([
    organizationMemberId ? prisma.organizationMember.findFirst({ where: { id: organizationMemberId, organizationId, status: "ACTIVE", removedAt: null }, select: { id: true, userId: true } }) : null,
    data.enterprisePositionId ? prisma.enterprisePosition.findFirst({ where: { id: data.enterprisePositionId, organizationId, isActive: true, sector: { code: "HEALTH_CARE" } }, select: { id: true, permissionsJson: true } }) : null,
    data.enterpriseDepartmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.enterpriseDepartmentId, organizationId, isActive: true }, select: { id: true } }) : null,
    data.healthSpecialtyId ? prisma.healthSpecialty.findFirst({ where: { id: data.healthSpecialtyId, organizationId, isActive: true }, select: { id: true } }) : null,
    data.supervisorStaffId ? prisma.healthStaffAssignment.findFirst({ where: { id: data.supervisorStaffId, organizationId, status: "ACTIVE" }, select: { id: true } }) : null,
  ]);
  if (!member) return { error: "Le membre sélectionné n’est pas actif dans cette entreprise." };
  if (data.enterprisePositionId && !position) return { error: "Le poste santé sélectionné n’appartient pas à cette entreprise." };
  if (data.enterpriseDepartmentId && !department) return { error: "Le service sélectionné n’appartient pas à cette entreprise." };
  if (data.healthSpecialtyId && !specialty) return { error: "La spécialité sélectionnée n’appartient pas à cette entreprise." };
  if (data.supervisorStaffId && !supervisor) return { error: "Le responsable sélectionné n’est pas un professionnel actif de cette entreprise." };
  return { member, position };
}

export async function createHealthStaffAssignment(organizationId: string, actorUserId: string, data: StaffInput) {
  const refs = await validateHealthStaffReferences(organizationId, data);
  if (refs.error || !refs.member) throw new Error("INVALID_REFERENCE");
  const existing = await prisma.healthStaffAssignment.findFirst({ where: { organizationId, organizationMemberId: refs.member.id } });
  if (existing) throw new Error("DUPLICATE_ASSIGNMENT");
  const defaultPermissions = Array.isArray(refs.position?.permissionsJson) ? refs.position.permissionsJson.filter((item): item is string => typeof item === "string") : [];
  const selectedPermissions = data.permissions || defaultPermissions;
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.healthStaffAssignment.create({ data: {
      organizationId, organizationMemberId: refs.member!.id, userId: refs.member!.userId, enterprisePositionId: data.enterprisePositionId, enterpriseDepartmentId: data.enterpriseDepartmentId,
      healthSpecialtyId: nil(data.healthSpecialtyId), supervisorStaffId: nil(data.supervisorStaffId), professionalNumber: nil(data.professionalNumber), professionalOrder: nil(data.professionalOrder),
      experienceLevel: nil(data.experienceLevel), competenceArea: nil(data.competenceArea), availabilityStatus: data.availabilityStatus, usualWorkDays: data.usualWorkDays || [],
      usualStartTime: nil(data.usualStartTime), usualEndTime: nil(data.usualEndTime), dailyCapacity: data.dailyCapacity, status: data.status, permissionsJson: selectedPermissions, notes: nil(data.notes), createdById: actorUserId,
    } });
    await tx.healthStaffEvent.create({ data: { organizationId, staffAssignmentId: assignment.id, eventType: "CREATED", summary: "Affectation professionnelle Santé créée.", actorUserId } });
    return assignment;
  });
}

export async function updateHealthStaffAssignment(organizationId: string, assignmentId: string, actorUserId: string, data: Partial<StaffInput>, canManagePermissions: boolean) {
  const existing = await prisma.healthStaffAssignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!existing) return null;
  if (data.organizationMemberId && data.organizationMemberId !== existing.organizationMemberId) throw new Error("MEMBER_IMMUTABLE");
  if (data.supervisorStaffId === existing.id) throw new Error("INVALID_SUPERVISOR");
  if (data.permissions && !canManagePermissions) throw new Error("PERMISSIONS_FORBIDDEN");
  const refs = await validateHealthStaffReferences(organizationId, data, existing.organizationMemberId);
  if (refs.error) throw new Error("INVALID_REFERENCE");
  const { permissions, status: ignoredStatus, organizationMemberId: ignoredMemberId, ...editableData } = data;
  void ignoredStatus;
  void ignoredMemberId;
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.healthStaffAssignment.update({ where: { id: existing.id }, data: {
      ...editableData, healthSpecialtyId: data.healthSpecialtyId === "" ? null : data.healthSpecialtyId, supervisorStaffId: data.supervisorStaffId === "" ? null : data.supervisorStaffId,
      permissionsJson: permissions, notes: data.notes === "" ? null : data.notes, updatedById: actorUserId,
    } });
    await tx.healthStaffEvent.create({ data: { organizationId, staffAssignmentId: assignment.id, eventType: permissions ? "PERMISSIONS_UPDATED" : "UPDATED", summary: permissions ? "Permissions Santé modifiées." : "Affectation professionnelle Santé modifiée.", actorUserId } });
    return assignment;
  });
}

export async function transitionHealthStaffAssignment(organizationId: string, assignmentId: string, actorUserId: string, action: "suspend"|"reactivate"|"archive", reason: string) {
  const existing = await prisma.healthStaffAssignment.findFirst({ where: { id: assignmentId, organizationId } });
  if (!existing) throw new Error("NOT_FOUND");
  const now = new Date();
  const status = action === "suspend" ? "SUSPENDED" : action === "archive" ? "ARCHIVED" : "ACTIVE";
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.healthStaffAssignment.update({ where: { id: existing.id }, data: { status, availabilityStatus: action === "suspend" ? "SUSPENDED" : action === "reactivate" ? "AVAILABLE" : existing.availabilityStatus, suspendedById: action === "suspend" ? actorUserId : null, suspendedAt: action === "suspend" ? now : null, suspensionReason: action === "suspend" ? reason : null, archivedById: action === "archive" ? actorUserId : null, archivedAt: action === "archive" ? now : null, archiveReason: action === "archive" ? reason : null, updatedById: actorUserId } });
    await tx.healthStaffEvent.create({ data: { organizationId, staffAssignmentId: assignment.id, eventType: action.toUpperCase(), summary: reason, actorUserId } });
    return assignment;
  });
}

export async function listAssignableHealthStaff(organizationId: string, clinicalOnly = false) {
  const clinicalPositionCodes = ["MEDICAL_DIRECTOR","DOCTOR","SPECIALIST_DOCTOR","NURSE","HEAD_NURSE","LAB_TECHNICIAN","LAB_MANAGER","PHARMACIST","ASSISTANT_PHARMACIST","OTHER_HEALTH_PROFESSIONAL"];
  return prisma.healthStaffAssignment.findMany({ where: { organizationId, status: "ACTIVE", availabilityStatus: { notIn: ["SUSPENDED", "UNAVAILABLE", "ON_LEAVE"] }, ...(clinicalOnly ? { enterprisePosition: { positionCode: { in: clinicalPositionCodes } } } : {}) }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } }, availabilityStatus: true, enterprisePosition: { select: { positionCode: true, labelFr: true } }, enterpriseDepartment: { select: { id: true, labelFr: true } }, healthSpecialty: { select: { labelFr: true } } } });
}

export async function validateAssignableHealthProfessional(organizationId: string, userId: string, clinicalOnly = false) {
  const clinicalPositionCodes = ["MEDICAL_DIRECTOR","DOCTOR","SPECIALIST_DOCTOR","NURSE","HEAD_NURSE","LAB_TECHNICIAN","LAB_MANAGER","PHARMACIST","ASSISTANT_PHARMACIST","OTHER_HEALTH_PROFESSIONAL"];
  return prisma.healthStaffAssignment.findFirst({ where: { organizationId, userId, status: "ACTIVE", availabilityStatus: { notIn: ["SUSPENDED", "UNAVAILABLE", "ON_LEAVE"] }, ...(clinicalOnly ? { enterprisePosition: { positionCode: { in: clinicalPositionCodes } } } : {}) }, select: { id: true, userId: true, enterpriseDepartmentId: true } });
}
