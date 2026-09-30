import { Prisma } from "@prisma/client";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import type {
  EducationAdmissionActionInput,
  EducationAdmissionCreateInput,
  EducationAdmissionUpdateInput,
  EducationEnrollmentActionInput,
  EducationGuardianCreateInput,
  EducationStudentGuardianLinkInput,
  EducationStudentUpdateInput,
} from "@/lib/enterprise/education/admissions-schemas";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

type ListInput = {
  page: number;
  pageSize: number;
  skip: number;
  search: string;
  status: string;
  campusId: string | null;
  academicYearId: string | null;
};

function pageResult(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const boundedPage = Math.min(page, totalPages);
  return {
    page: boundedPage,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: boundedPage > 1,
    hasNextPage: boundedPage < totalPages,
  };
}

function reference(prefix: string) {
  return `${prefix}-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function audit(tx: Tx, userId: string, organizationId: string, action: string, entity: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await tx.auditLog.create({
    data: {
      userId,
      organizationId,
      action,
      entity,
      entityId,
      result: "SUCCESS",
      riskLevel: "LOW",
      metadata: { organizationId, domain: "education", ...metadata },
    },
  }).catch(() => null);
}

async function validateExternalIdentityLinks(tx: Tx, organizationId: string, input: { userId?: string | null; businessPartyId?: string | null }) {
  if (input.userId) {
    const member = await tx.organizationMember.findFirst({
      where: { organizationId, userId: input.userId, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    if (!member) throw new EnterpriseDomainError("EDUCATION_USER_LINK_INVALID", 409);
  }
  if (input.businessPartyId) {
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!party) throw new EnterpriseDomainError("EDUCATION_PARTY_LINK_INVALID", 409);
  }
}

async function validatePlacementReferences(
  tx: Tx,
  organizationId: string,
  input: {
    academicYearId: string;
    campusId: string;
    programId?: string | null;
    levelId?: string | null;
    classGroupId?: string | null;
  },
) {
  const [year, campus, program, level, classGroup] = await Promise.all([
    tx.enterpriseEducationAcademicYear.findFirst({ where: { id: input.academicYearId, organizationId, archivedAt: null } }),
    tx.enterpriseEducationCampus.findFirst({ where: { id: input.campusId, organizationId, archivedAt: null } }),
    input.programId ? tx.enterpriseEducationProgram.findFirst({ where: { id: input.programId, organizationId, archivedAt: null } }) : Promise.resolve(null),
    input.levelId ? tx.enterpriseEducationAcademicLevel.findFirst({ where: { id: input.levelId, organizationId, archivedAt: null } }) : Promise.resolve(null),
    input.classGroupId ? tx.enterpriseEducationClassGroup.findFirst({ where: { id: input.classGroupId, organizationId, archivedAt: null } }) : Promise.resolve(null),
  ]);
  if (!year || !campus || (input.programId && !program) || (input.levelId && !level) || (input.classGroupId && !classGroup)) {
    throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  }
  if (classGroup) {
    if (classGroup.academicYearId !== input.academicYearId || classGroup.campusId !== input.campusId) {
      throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
    }
    if (input.levelId && classGroup.levelId !== input.levelId) {
      throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
    }
    if (input.programId && classGroup.programId && classGroup.programId !== input.programId) {
      throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
    }
  }
  return { year, campus, program, level, classGroup };
}

export async function getEducationPopulationSnapshot(organizationId: string) {
  const [admissionCount, pendingAdmissionCount, studentCount, activeEnrollmentCount, guardianCount, academicYears, campuses, programs, levels, classGroups, students, guardians] = await Promise.all([
    prisma.enterpriseEducationAdmissionApplication.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationAdmissionApplication.count({ where: { organizationId, archivedAt: null, status: { in: ["SUBMITTED", "UNDER_REVIEW", "WAITLISTED"] } } }),
    prisma.enterpriseEducationStudent.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationEnrollment.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseEducationGuardian.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationAcademicYear.findMany({ where: { organizationId, archivedAt: null }, orderBy: { startDate: "desc" }, take: 50, select: { id: true, code: true, label: true, status: true } }),
    prisma.enterpriseEducationCampus.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, status: true } }),
    prisma.enterpriseEducationProgram.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, status: true } }),
    prisma.enterpriseEducationAcademicLevel.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sequence: "asc" }, { label: "asc" }], take: 100, select: { id: true, code: true, label: true, status: true } }),
    prisma.enterpriseEducationClassGroup.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 150, select: { id: true, code: true, name: true, academicYearId: true, campusId: true, levelId: true, programId: true, status: true } }),
    prisma.enterpriseEducationStudent.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 200, select: { id: true, studentNumber: true, firstName: true, lastName: true, status: true } }),
    prisma.enterpriseEducationGuardian.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 200, select: { id: true, guardianNumber: true, firstName: true, lastName: true, status: true } }),
  ]);
  return {
    counts: { admissionCount, pendingAdmissionCount, studentCount, activeEnrollmentCount, guardianCount },
    references: { academicYears, campuses, programs, levels, classGroups, students, guardians },
  };
}

export async function listAdmissions(organizationId: string, input: ListInput) {
  const where = {
    organizationId,
    archivedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.campusId ? { campusId: input.campusId } : {}),
    ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
    ...(input.search ? {
      OR: [
        { applicationNumber: { contains: input.search, mode: "insensitive" as const } },
        { candidate: { firstName: { contains: input.search, mode: "insensitive" as const } } },
        { candidate: { lastName: { contains: input.search, mode: "insensitive" as const } } },
        { candidate: { candidateNumber: { contains: input.search, mode: "insensitive" as const } } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseEducationAdmissionApplication.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: input.skip,
      take: input.pageSize,
      include: {
        candidate: true,
        academicYear: { select: { id: true, code: true, label: true } },
        campus: { select: { id: true, code: true, name: true } },
        program: { select: { id: true, code: true, name: true } },
        level: { select: { id: true, code: true, label: true } },
        classGroup: { select: { id: true, code: true, name: true } },
        decisions: { orderBy: { decidedAt: "desc" }, take: 5 },
        enrollment: { select: { id: true, enrollmentNumber: true, status: true, studentId: true } },
      },
    }),
    prisma.enterpriseEducationAdmissionApplication.count({ where }),
  ]);
  return { items, pagination: pageResult(total, input.page, input.pageSize) };
}

export async function createAdmission(organizationId: string, userId: string, input: EducationAdmissionCreateInput) {
  return prisma.$transaction(async (tx) => {
    await validatePlacementReferences(tx, organizationId, input);
    const candidate = await tx.enterpriseEducationCandidate.create({
      data: {
        organizationId,
        candidateNumber: reference("CAND"),
        firstName: input.candidate.firstName,
        lastName: input.candidate.lastName,
        middleName: input.candidate.middleName || null,
        preferredName: input.candidate.preferredName || null,
        birthDate: input.candidate.birthDate || null,
        sex: input.candidate.sex || null,
        nationalityCode: input.candidate.nationalityCode || null,
        email: input.candidate.email || null,
        phone: input.candidate.phone || null,
        ...(input.candidate.addressJson ? { addressJson: input.candidate.addressJson as Prisma.InputJsonValue } : {}),
        createdByUserId: userId,
      },
    });
    const application = await tx.enterpriseEducationAdmissionApplication.create({
      data: {
        organizationId,
        applicationNumber: reference("ADM"),
        candidateId: candidate.id,
        academicYearId: input.academicYearId,
        campusId: input.campusId,
        programId: input.programId || null,
        levelId: input.levelId || null,
        classGroupId: input.classGroupId || null,
        applicantNotes: input.applicantNotes || null,
        internalNotes: input.internalNotes || null,
        createdByUserId: userId,
      },
      include: { candidate: true },
    });
    await audit(tx, userId, organizationId, "EDUCATION_ADMISSION_CREATED", "EnterpriseEducationAdmissionApplication", application.id, { candidateId: candidate.id });
    return application;
  });
}

export async function updateAdmission(organizationId: string, userId: string, applicationId: string, input: EducationAdmissionUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.enterpriseEducationAdmissionApplication.findFirst({ where: { id: applicationId, organizationId, archivedAt: null } });
    if (!current) throw new EnterpriseDomainError("EDUCATION_ADMISSION_NOT_FOUND", 404);
    if (current.status !== "DRAFT") throw new EnterpriseDomainError("EDUCATION_ADMISSION_LOCKED", 409);
    await validatePlacementReferences(tx, organizationId, input);
    const result = await tx.enterpriseEducationAdmissionApplication.updateMany({
      where: { id: applicationId, organizationId, revision: input.revision, status: "DRAFT", archivedAt: null },
      data: {
        academicYearId: input.academicYearId,
        campusId: input.campusId,
        programId: input.programId || null,
        levelId: input.levelId || null,
        classGroupId: input.classGroupId || null,
        applicantNotes: input.applicantNotes || null,
        internalNotes: input.internalNotes || null,
        updatedByUserId: userId,
        revision: { increment: 1 },
      },
    });
    if (!result.count) throw new EnterpriseDomainConflictError();
    const updated = await tx.enterpriseEducationAdmissionApplication.findUniqueOrThrow({ where: { id: applicationId } });
    await audit(tx, userId, organizationId, "EDUCATION_ADMISSION_UPDATED", "EnterpriseEducationAdmissionApplication", applicationId);
    return updated;
  });
}

async function transitionApplication(
  tx: Tx,
  organizationId: string,
  userId: string,
  applicationId: string,
  expectedRevision: number,
  allowedStatuses: string[],
  data: Prisma.EnterpriseEducationAdmissionApplicationUpdateManyMutationInput,
) {
  const result = await tx.enterpriseEducationAdmissionApplication.updateMany({
    where: { id: applicationId, organizationId, revision: expectedRevision, status: { in: allowedStatuses }, archivedAt: null },
    data: { ...data, updatedByUserId: userId, revision: { increment: 1 } },
  });
  if (!result.count) {
    const exists = await tx.enterpriseEducationAdmissionApplication.findFirst({ where: { id: applicationId, organizationId, archivedAt: null }, select: { id: true, revision: true, status: true } });
    if (!exists) throw new EnterpriseDomainError("EDUCATION_ADMISSION_NOT_FOUND", 404);
    if (exists.revision !== expectedRevision) throw new EnterpriseDomainConflictError();
    throw new EnterpriseDomainError("EDUCATION_ADMISSION_STATE_INVALID", 409);
  }
  return tx.enterpriseEducationAdmissionApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { candidate: true, enrollment: true } });
}

export async function actOnAdmission(organizationId: string, userId: string, applicationId: string, input: EducationAdmissionActionInput) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.enterpriseEducationAdmissionApplication.findFirst({
      where: { id: applicationId, organizationId, archivedAt: null },
      include: { candidate: true, enrollment: true },
    });
    if (!application) throw new EnterpriseDomainError("EDUCATION_ADMISSION_NOT_FOUND", 404);

    if (input.action === "SUBMIT") {
      const updated = await transitionApplication(tx, organizationId, userId, applicationId, input.revision, ["DRAFT"], { status: "SUBMITTED", submittedAt: new Date() });
      await audit(tx, userId, organizationId, "EDUCATION_ADMISSION_SUBMITTED", "EnterpriseEducationAdmissionApplication", applicationId);
      return { application: updated };
    }

    if (input.action === "START_REVIEW") {
      const updated = await transitionApplication(tx, organizationId, userId, applicationId, input.revision, ["SUBMITTED", "WAITLISTED"], { status: "UNDER_REVIEW", reviewStartedAt: new Date() });
      await audit(tx, userId, organizationId, "EDUCATION_ADMISSION_REVIEW_STARTED", "EnterpriseEducationAdmissionApplication", applicationId);
      return { application: updated };
    }

    if (input.action === "DECIDE") {
      const now = new Date();
      const updated = await transitionApplication(tx, organizationId, userId, applicationId, input.revision, ["UNDER_REVIEW"], { status: input.decision, decidedAt: now });
      const decision = await tx.enterpriseEducationAdmissionDecision.create({
        data: { organizationId, applicationId, decision: input.decision, reason: input.reason || null, decidedByUserId: userId, decidedAt: now },
      });
      await audit(tx, userId, organizationId, "EDUCATION_ADMISSION_DECIDED", "EnterpriseEducationAdmissionApplication", applicationId, { decision: input.decision, decisionId: decision.id });
      return { application: updated, decision };
    }

    if (input.action === "WITHDRAW") {
      const updated = await transitionApplication(tx, organizationId, userId, applicationId, input.revision, ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "WAITLISTED", "ACCEPTED"], { status: "WITHDRAWN", decidedAt: new Date() });
      await audit(tx, userId, organizationId, "EDUCATION_ADMISSION_WITHDRAWN", "EnterpriseEducationAdmissionApplication", applicationId);
      return { application: updated };
    }

    if (application.status !== "ACCEPTED") throw new EnterpriseDomainError("EDUCATION_ADMISSION_NOT_ACCEPTED", 409);
    if (application.revision !== input.revision) throw new EnterpriseDomainConflictError();
    if (application.enrollment) {
      const existing = await tx.enterpriseEducationEnrollment.findFirst({
        where: { id: application.enrollment.id, organizationId },
        include: { student: true, placements: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
      });
      return { enrollment: existing, idempotent: true };
    }

    await validatePlacementReferences(tx, organizationId, {
      academicYearId: application.academicYearId,
      campusId: input.campusId,
      programId: input.programId,
      levelId: input.levelId,
      classGroupId: input.classGroupId,
    });

    let student = await tx.enterpriseEducationStudent.findFirst({
      where: { organizationId, sourceCandidateId: application.candidateId },
    });
    if (!student) {
      student = await tx.enterpriseEducationStudent.create({
        data: {
          organizationId,
          studentNumber: reference("STU"),
          sourceCandidateId: application.candidateId,
          firstName: application.candidate.firstName,
          lastName: application.candidate.lastName,
          middleName: application.candidate.middleName,
          preferredName: application.candidate.preferredName,
          birthDate: application.candidate.birthDate,
          sex: application.candidate.sex,
          nationalityCode: application.candidate.nationalityCode,
          email: application.candidate.email,
          phone: application.candidate.phone,
          createdByUserId: userId,
        },
      });
    }

    const enrolledAt = input.enrolledAt || new Date();
    const enrollment = await tx.enterpriseEducationEnrollment.create({
      data: {
        organizationId,
        enrollmentNumber: reference("ENR"),
        studentId: student.id,
        academicYearId: application.academicYearId,
        admissionApplicationId: application.id,
        status: "ACTIVE",
        enrolledAt,
        createdByUserId: userId,
      },
    });
    const placement = await tx.enterpriseEducationEnrollmentPlacement.create({
      data: {
        organizationId,
        enrollmentId: enrollment.id,
        campusId: input.campusId,
        programId: input.programId || null,
        levelId: input.levelId,
        classGroupId: input.classGroupId || null,
        placementReason: "INITIAL",
        effectiveFrom: enrolledAt,
        createdByUserId: userId,
      },
    });
    await tx.enterpriseEducationEnrollmentHistory.create({
      data: {
        organizationId,
        enrollmentId: enrollment.id,
        eventType: "ENROLLED",
        previousStatus: "PENDING",
        newStatus: "ACTIVE",
        toPlacementId: placement.id,
        actorUserId: userId,
        occurredAt: enrolledAt,
      },
    });
    await tx.enterpriseEducationCandidate.update({
      where: { id: application.candidateId },
      data: { status: "CONVERTED", updatedByUserId: userId, revision: { increment: 1 } },
    });
    await tx.enterpriseEducationAdmissionApplication.update({
      where: { id: applicationId },
      data: { status: "ENROLLED", updatedByUserId: userId, revision: { increment: 1 } },
    });
    await audit(tx, userId, organizationId, "EDUCATION_ENROLLMENT_CREATED", "EnterpriseEducationEnrollment", enrollment.id, { applicationId, studentId: student.id, placementId: placement.id });
    return { enrollment: { ...enrollment, student, placements: [placement] }, idempotent: false };
  });
}

export async function listStudents(organizationId: string, input: ListInput) {
  const where = {
    organizationId,
    archivedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? {
      OR: [
        { studentNumber: { contains: input.search, mode: "insensitive" as const } },
        { firstName: { contains: input.search, mode: "insensitive" as const } },
        { lastName: { contains: input.search, mode: "insensitive" as const } },
        { email: { contains: input.search, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseEducationStudent.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: input.skip,
      take: input.pageSize,
      include: {
        enrollments: {
          where: { archivedAt: null },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: {
            academicYear: { select: { id: true, label: true, code: true } },
            placements: {
              orderBy: { effectiveFrom: "desc" },
              take: 1,
              include: {
                campus: { select: { id: true, name: true, code: true } },
                program: { select: { id: true, name: true, code: true } },
                level: { select: { id: true, label: true, code: true } },
                classGroup: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
        guardians: {
          where: { archivedAt: null },
          include: { guardian: true },
        },
      },
    }),
    prisma.enterpriseEducationStudent.count({ where }),
  ]);
  return { items, pagination: pageResult(total, input.page, input.pageSize) };
}

export async function updateStudent(organizationId: string, userId: string, studentId: string, input: EducationStudentUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.enterpriseEducationStudent.findFirst({ where: { id: studentId, organizationId, archivedAt: null } });
    if (!current) throw new EnterpriseDomainError("EDUCATION_STUDENT_NOT_FOUND", 404);
    await validateExternalIdentityLinks(tx, organizationId, input);
    const result = await tx.enterpriseEducationStudent.updateMany({
      where: { id: studentId, organizationId, revision: input.revision, archivedAt: null },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName || null,
        preferredName: input.preferredName || null,
        birthDate: input.birthDate || null,
        sex: input.sex || null,
        nationalityCode: input.nationalityCode || null,
        email: input.email || null,
        phone: input.phone || null,
        userId: input.userId || null,
        businessPartyId: input.businessPartyId || null,
        updatedByUserId: userId,
        revision: { increment: 1 },
      },
    });
    if (!result.count) throw new EnterpriseDomainConflictError();
    const updated = await tx.enterpriseEducationStudent.findUniqueOrThrow({ where: { id: studentId } });
    await audit(tx, userId, organizationId, "EDUCATION_STUDENT_UPDATED", "EnterpriseEducationStudent", studentId);
    return updated;
  });
}

export async function listGuardians(organizationId: string, input: ListInput) {
  const where = {
    organizationId,
    archivedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? {
      OR: [
        { guardianNumber: { contains: input.search, mode: "insensitive" as const } },
        { firstName: { contains: input.search, mode: "insensitive" as const } },
        { lastName: { contains: input.search, mode: "insensitive" as const } },
        { email: { contains: input.search, mode: "insensitive" as const } },
        { phone: { contains: input.search, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseEducationGuardian.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: input.skip,
      take: input.pageSize,
      include: {
        students: {
          where: { archivedAt: null },
          include: { student: { select: { id: true, studentNumber: true, firstName: true, lastName: true, status: true } } },
        },
      },
    }),
    prisma.enterpriseEducationGuardian.count({ where }),
  ]);
  return { items, pagination: pageResult(total, input.page, input.pageSize) };
}

export async function createGuardian(organizationId: string, userId: string, input: EducationGuardianCreateInput) {
  return prisma.$transaction(async (tx) => {
    await validateExternalIdentityLinks(tx, organizationId, input);
    const guardian = await tx.enterpriseEducationGuardian.create({
      data: {
        organizationId,
        guardianNumber: reference("GUA"),
        businessPartyId: input.businessPartyId || null,
        userId: input.userId || null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        preferredLanguage: input.preferredLanguage || null,
        createdByUserId: userId,
      },
    });
    await audit(tx, userId, organizationId, "EDUCATION_GUARDIAN_CREATED", "EnterpriseEducationGuardian", guardian.id);
    return guardian;
  });
}

export async function linkGuardianToStudent(organizationId: string, userId: string, studentId: string, input: EducationStudentGuardianLinkInput) {
  return prisma.$transaction(async (tx) => {
    const [student, guardian] = await Promise.all([
      tx.enterpriseEducationStudent.findFirst({ where: { id: studentId, organizationId, archivedAt: null } }),
      tx.enterpriseEducationGuardian.findFirst({ where: { id: input.guardianId, organizationId, archivedAt: null } }),
    ]);
    if (!student) throw new EnterpriseDomainError("EDUCATION_STUDENT_NOT_FOUND", 404);
    if (!guardian) throw new EnterpriseDomainError("EDUCATION_GUARDIAN_NOT_FOUND", 404);

    if (input.isPrimary) {
      await tx.enterpriseEducationStudentGuardian.updateMany({
        where: { organizationId, studentId, isPrimary: true, archivedAt: null },
        data: { isPrimary: false, updatedByUserId: userId, revision: { increment: 1 } },
      });
    }

    const existing = await tx.enterpriseEducationStudentGuardian.findFirst({
      where: { organizationId, studentId, guardianId: input.guardianId },
    });
    const relation = existing
      ? await tx.enterpriseEducationStudentGuardian.update({
          where: { id: existing.id },
          data: {
            relationshipType: input.relationshipType,
            isPrimary: input.isPrimary,
            isLegalGuardian: input.isLegalGuardian,
            isBillingContact: input.isBillingContact,
            isNotificationContact: input.isNotificationContact,
            effectiveUntil: null,
            archivedAt: null,
            updatedByUserId: userId,
            revision: { increment: 1 },
          },
        })
      : await tx.enterpriseEducationStudentGuardian.create({
          data: {
            organizationId,
            studentId,
            guardianId: input.guardianId,
            relationshipType: input.relationshipType,
            isPrimary: input.isPrimary,
            isLegalGuardian: input.isLegalGuardian,
            isBillingContact: input.isBillingContact,
            isNotificationContact: input.isNotificationContact,
            createdByUserId: userId,
          },
        });
    await audit(tx, userId, organizationId, "EDUCATION_STUDENT_GUARDIAN_LINKED", "EnterpriseEducationStudentGuardian", relation.id, { studentId, guardianId: input.guardianId });
    return relation;
  });
}

export async function actOnEnrollment(organizationId: string, userId: string, enrollmentId: string, input: EducationEnrollmentActionInput) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.enterpriseEducationEnrollment.findFirst({
      where: { id: enrollmentId, organizationId, archivedAt: null },
      include: { placements: { where: { effectiveUntil: null }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
    });
    if (!enrollment) throw new EnterpriseDomainError("EDUCATION_ENROLLMENT_NOT_FOUND", 404);
    if (enrollment.revision !== input.revision) throw new EnterpriseDomainConflictError();

    const effectiveAt = input.effectiveAt || new Date();
    const currentPlacement = enrollment.placements[0] || null;

    if (input.action === "TRANSFER" || input.action === "REACTIVATE") {
      if (input.action === "TRANSFER" && enrollment.status !== "ACTIVE") throw new EnterpriseDomainError("EDUCATION_ENROLLMENT_STATE_INVALID", 409);
      if (input.action === "REACTIVATE" && !["WITHDRAWN", "TRANSFERRED"].includes(enrollment.status)) throw new EnterpriseDomainError("EDUCATION_ENROLLMENT_STATE_INVALID", 409);
      await validatePlacementReferences(tx, organizationId, {
        academicYearId: enrollment.academicYearId,
        campusId: input.campusId,
        programId: input.programId,
        levelId: input.levelId,
        classGroupId: input.classGroupId,
      });
      if (currentPlacement) {
        await tx.enterpriseEducationEnrollmentPlacement.update({
          where: { id: currentPlacement.id },
          data: { effectiveUntil: effectiveAt, updatedByUserId: userId, revision: { increment: 1 } },
        });
      }
      const nextPlacement = await tx.enterpriseEducationEnrollmentPlacement.create({
        data: {
          organizationId,
          enrollmentId,
          campusId: input.campusId,
          programId: input.programId || null,
          levelId: input.levelId,
          classGroupId: input.classGroupId || null,
          placementReason: input.action,
          effectiveFrom: effectiveAt,
          createdByUserId: userId,
        },
      });
      const update = await tx.enterpriseEducationEnrollment.updateMany({
        where: { id: enrollmentId, organizationId, revision: input.revision },
        data: { status: "ACTIVE", withdrawnAt: null, completedAt: null, updatedByUserId: userId, revision: { increment: 1 } },
      });
      if (!update.count) throw new EnterpriseDomainConflictError();
      await tx.enterpriseEducationEnrollmentHistory.create({
        data: {
          organizationId,
          enrollmentId,
          eventType: input.action,
          previousStatus: enrollment.status,
          newStatus: "ACTIVE",
          fromPlacementId: currentPlacement?.id || null,
          toPlacementId: nextPlacement.id,
          reason: input.reason,
          actorUserId: userId,
          occurredAt: effectiveAt,
        },
      });
      await audit(tx, userId, organizationId, "EDUCATION_ENROLLMENT_STATUS_CHANGED", "EnterpriseEducationEnrollment", enrollmentId, { action: input.action, placementId: nextPlacement.id });
      return tx.enterpriseEducationEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { placements: { orderBy: { effectiveFrom: "desc" }, take: 2 } } });
    }

    if (enrollment.status !== "ACTIVE") throw new EnterpriseDomainError("EDUCATION_ENROLLMENT_STATE_INVALID", 409);
    if (currentPlacement) {
      await tx.enterpriseEducationEnrollmentPlacement.update({
        where: { id: currentPlacement.id },
        data: { effectiveUntil: effectiveAt, updatedByUserId: userId, revision: { increment: 1 } },
      });
    }
    const nextStatus = input.action === "WITHDRAW" ? "WITHDRAWN" : "COMPLETED";
    const update = await tx.enterpriseEducationEnrollment.updateMany({
      where: { id: enrollmentId, organizationId, revision: input.revision, status: "ACTIVE" },
      data: {
        status: nextStatus,
        ...(nextStatus === "WITHDRAWN" ? { withdrawnAt: effectiveAt } : { completedAt: effectiveAt }),
        updatedByUserId: userId,
        revision: { increment: 1 },
      },
    });
    if (!update.count) throw new EnterpriseDomainConflictError();
    await tx.enterpriseEducationEnrollmentHistory.create({
      data: {
        organizationId,
        enrollmentId,
        eventType: input.action,
        previousStatus: enrollment.status,
        newStatus: nextStatus,
        fromPlacementId: currentPlacement?.id || null,
        reason: input.reason || null,
        actorUserId: userId,
        occurredAt: effectiveAt,
      },
    });
    await audit(tx, userId, organizationId, "EDUCATION_ENROLLMENT_STATUS_CHANGED", "EnterpriseEducationEnrollment", enrollmentId, { action: input.action, status: nextStatus });
    return tx.enterpriseEducationEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { placements: { orderBy: { effectiveFrom: "desc" }, take: 2 } } });
  });
}
