import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import type { EducationResourceCode } from "@/lib/enterprise/education/constants";
import type {
  EducationAcademicYearInput,
  EducationCalendarEventInput,
  EducationCampusInput,
  EducationClassGroupInput,
  EducationCourseOfferingInput,
  EducationDepartmentInput,
  EducationLevelInput,
  EducationPeriodInput,
  EducationProgramInput,
  EducationSettingsInput,
  EducationSubjectInput,
} from "@/lib/enterprise/education/schemas";
import { prisma } from "@/lib/prisma";

type ListInput = {
  page: number;
  pageSize: number;
  skip: number;
  search: string;
  status: string;
  campusId: string | null;
  academicYearId: string | null;
};

function pagination(total: number, page: number, pageSize: number) {
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

async function campusRef(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const item = await prisma.enterpriseEducationCampus.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function yearRef(organizationId: string, id: string) {
  const item = await prisma.enterpriseEducationAcademicYear.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function periodRef(organizationId: string, id: string | null | undefined, academicYearId?: string) {
  if (!id) return null;
  const item = await prisma.enterpriseEducationAcademicPeriod.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  if (academicYearId && item.academicYearId !== academicYearId) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
  return item;
}

async function levelRef(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const item = await prisma.enterpriseEducationAcademicLevel.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function departmentRef(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const item = await prisma.enterpriseEducationDepartment.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function programRef(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const item = await prisma.enterpriseEducationProgram.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function subjectRef(organizationId: string, id: string) {
  const item = await prisma.enterpriseEducationSubject.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function classGroupRef(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const item = await prisma.enterpriseEducationClassGroup.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!item) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
  return item;
}

async function writeEducationAudit(userId: string, organizationId: string, action: string, entity: string, entityId: string) {
  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action,
      entity,
      entityId,
      result: "SUCCESS",
      riskLevel: "LOW",
      metadata: { organizationId, domain: "education" },
    },
  }).catch(() => null);
}

export async function getEducationWorkspaceSnapshot(organizationId: string) {
  const [
    settings,
    campusCount,
    yearCount,
    activeYearCount,
    periodCount,
    levelCount,
    programCount,
    classGroupCount,
    subjectCount,
    offeringCount,
    calendarCount,
    campuses,
    academicYears,
    levels,
    departments,
    programs,
    subjects,
    periods,
    classGroups,
  ] = await Promise.all([
    prisma.enterpriseEducationInstitutionSettings.findUnique({ where: { organizationId } }),
    prisma.enterpriseEducationCampus.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationAcademicYear.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationAcademicYear.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseEducationAcademicPeriod.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationAcademicLevel.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationProgram.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationClassGroup.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationSubject.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationCourseOffering.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationCalendarEvent.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseEducationCampus.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, status: true } }),
    prisma.enterpriseEducationAcademicYear.findMany({ where: { organizationId, archivedAt: null }, orderBy: { startDate: "desc" }, take: 50, select: { id: true, code: true, label: true, status: true, startDate: true, endDate: true } }),
    prisma.enterpriseEducationAcademicLevel.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sequence: "asc" }, { label: "asc" }], take: 100, select: { id: true, code: true, label: true, status: true } }),
    prisma.enterpriseEducationDepartment.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, campusId: true, status: true } }),
    prisma.enterpriseEducationProgram.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, departmentId: true, status: true } }),
    prisma.enterpriseEducationSubject.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, departmentId: true, status: true } }),
    prisma.enterpriseEducationAcademicPeriod.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ academicYearId: "asc" }, { sequence: "asc" }], take: 100, select: { id: true, code: true, label: true, academicYearId: true, status: true } }),
    prisma.enterpriseEducationClassGroup.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100, select: { id: true, code: true, name: true, academicYearId: true, campusId: true, levelId: true, programId: true, status: true } }),
  ]);
  return {
    settings,
    counts: { campusCount, yearCount, activeYearCount, periodCount, levelCount, programCount, classGroupCount, subjectCount, offeringCount, calendarCount },
    references: { campuses, academicYears, periods, levels, departments, programs, classGroups, subjects },
    onboarding: {
      settings: Boolean(settings),
      campus: campusCount > 0,
      academicYear: yearCount > 0,
      structure: levelCount > 0 && subjectCount > 0,
      ready: Boolean(settings) && campusCount > 0 && yearCount > 0 && levelCount > 0 && subjectCount > 0,
    },
  };
}

export async function listEducationResource(organizationId: string, resource: EducationResourceCode, input: ListInput) {
  const take = input.pageSize;
  const skip = input.skip;
  const statusFilter = input.status ? { status: input.status } : {};
  const search = input.search;

  switch (resource) {
    case "SETTINGS": {
      const item = await prisma.enterpriseEducationInstitutionSettings.findUnique({ where: { organizationId } });
      return { items: item ? [item] : [], pagination: pagination(item ? 1 : 0, 1, 1) };
    }
    case "CAMPUS": {
      const where = { organizationId, archivedAt: null, ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationCampus.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip, take }),
        prisma.enterpriseEducationCampus.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "ACADEMIC_YEAR": {
      const where = { organizationId, archivedAt: null, ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { label: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationAcademicYear.findMany({ where, orderBy: { startDate: "desc" }, skip, take }),
        prisma.enterpriseEducationAcademicYear.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "PERIOD": {
      const where = { organizationId, archivedAt: null, ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}), ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { label: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationAcademicPeriod.findMany({ where, orderBy: [{ academicYearId: "asc" }, { sequence: "asc" }], skip, take, include: { academicYear: { select: { label: true } } } }),
        prisma.enterpriseEducationAcademicPeriod.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "LEVEL": {
      const where = { organizationId, archivedAt: null, ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { label: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationAcademicLevel.findMany({ where, orderBy: [{ sequence: "asc" }, { label: "asc" }], skip, take }),
        prisma.enterpriseEducationAcademicLevel.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "DEPARTMENT": {
      const where = { organizationId, archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}), ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationDepartment.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip, take, include: { campus: { select: { name: true } } } }),
        prisma.enterpriseEducationDepartment.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "PROGRAM": {
      const where = { organizationId, archivedAt: null, ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationProgram.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip, take, include: { department: { select: { name: true } } } }),
        prisma.enterpriseEducationProgram.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "CLASS_GROUP": {
      const where = { organizationId, archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}), ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}), ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationClassGroup.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip, take, include: { campus: { select: { name: true } }, academicYear: { select: { label: true } }, level: { select: { label: true } }, program: { select: { name: true } } } }),
        prisma.enterpriseEducationClassGroup.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "SUBJECT": {
      const where = { organizationId, archivedAt: null, ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationSubject.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip, take, include: { department: { select: { name: true } } } }),
        prisma.enterpriseEducationSubject.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "COURSE_OFFERING": {
      const where = { organizationId, archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}), ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}), ...statusFilter, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { displayName: { contains: search, mode: "insensitive" as const } }] } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationCourseOffering.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take, include: { subject: { select: { name: true } }, campus: { select: { name: true } }, academicYear: { select: { label: true } }, period: { select: { label: true } }, classGroup: { select: { name: true } } } }),
        prisma.enterpriseEducationCourseOffering.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
    case "CALENDAR_EVENT": {
      const where = { organizationId, archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}), ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}), ...statusFilter, ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}) };
      const [items, total] = await Promise.all([
        prisma.enterpriseEducationCalendarEvent.findMany({ where, orderBy: { startsAt: "asc" }, skip, take, include: { campus: { select: { name: true } }, academicYear: { select: { label: true } }, period: { select: { label: true } } } }),
        prisma.enterpriseEducationCalendarEvent.count({ where }),
      ]);
      return { items, pagination: pagination(total, input.page, take) };
    }
  }
}

export async function saveEducationSettings(organizationId: string, userId: string, input: EducationSettingsInput) {
  const defaultCampus = await campusRef(organizationId, input.defaultCampusId);
  const current = await prisma.enterpriseEducationInstitutionSettings.findUnique({ where: { organizationId } });
  if (current) {
    if (!input.revision || input.revision !== current.revision) throw new EnterpriseDomainConflictError();
    const updated = await prisma.enterpriseEducationInstitutionSettings.update({
      where: { organizationId },
      data: {
        institutionType: input.institutionType,
        legalName: input.legalName,
        registrationCode: input.registrationCode,
        timezone: input.timezone,
        weekStartsOn: input.weekStartsOn,
        defaultCampusId: defaultCampus?.id || null,
        updatedByUserId: userId,
        revision: { increment: 1 },
      },
    });
    await writeEducationAudit(userId, organizationId, "EDUCATION_SETTINGS_UPDATED", "EnterpriseEducationInstitutionSettings", updated.id);
    return updated;
  }
  const created = await prisma.enterpriseEducationInstitutionSettings.create({
    data: {
      organizationId,
      institutionType: input.institutionType,
      legalName: input.legalName,
      registrationCode: input.registrationCode,
      timezone: input.timezone,
      weekStartsOn: input.weekStartsOn,
      defaultCampusId: defaultCampus?.id || null,
      createdByUserId: userId,
    },
  });
  await writeEducationAudit(userId, organizationId, "EDUCATION_SETTINGS_CREATED", "EnterpriseEducationInstitutionSettings", created.id);
  return created;
}

export async function createEducationResource(
  organizationId: string,
  userId: string,
  resource: EducationResourceCode,
  rawInput:
    | EducationCampusInput
    | EducationAcademicYearInput
    | EducationPeriodInput
    | EducationLevelInput
    | EducationDepartmentInput
    | EducationProgramInput
    | EducationClassGroupInput
    | EducationSubjectInput
    | EducationCourseOfferingInput
    | EducationCalendarEventInput,
) {
  switch (resource) {
    case "CAMPUS": {
      const input = rawInput as EducationCampusInput;
      const item = await prisma.enterpriseEducationCampus.create({ data: { organizationId, ...input, createdByUserId: userId } });
      const settings = await prisma.enterpriseEducationInstitutionSettings.findUnique({ where: { organizationId } });
      if (settings && !settings.defaultCampusId) {
        await prisma.enterpriseEducationInstitutionSettings.update({ where: { organizationId }, data: { defaultCampusId: item.id, revision: { increment: 1 }, updatedByUserId: userId } });
      }
      await writeEducationAudit(userId, organizationId, "EDUCATION_CAMPUS_CREATED", "EnterpriseEducationCampus", item.id);
      return item;
    }
    case "ACADEMIC_YEAR": {
      const input = rawInput as EducationAcademicYearInput;
      const item = await prisma.enterpriseEducationAcademicYear.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_ACADEMIC_YEAR_CREATED", "EnterpriseEducationAcademicYear", item.id);
      return item;
    }
    case "PERIOD": {
      const input = rawInput as EducationPeriodInput;
      const year = await yearRef(organizationId, input.academicYearId);
      if (input.startDate < year.startDate || input.endDate > year.endDate) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
      const item = await prisma.enterpriseEducationAcademicPeriod.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_PERIOD_CREATED", "EnterpriseEducationAcademicPeriod", item.id);
      return item;
    }
    case "LEVEL": {
      const input = rawInput as EducationLevelInput;
      const item = await prisma.enterpriseEducationAcademicLevel.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_LEVEL_CREATED", "EnterpriseEducationAcademicLevel", item.id);
      return item;
    }
    case "DEPARTMENT": {
      const input = rawInput as EducationDepartmentInput;
      await campusRef(organizationId, input.campusId);
      const item = await prisma.enterpriseEducationDepartment.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_DEPARTMENT_CREATED", "EnterpriseEducationDepartment", item.id);
      return item;
    }
    case "PROGRAM": {
      const input = rawInput as EducationProgramInput;
      await departmentRef(organizationId, input.departmentId);
      const item = await prisma.enterpriseEducationProgram.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_PROGRAM_CREATED", "EnterpriseEducationProgram", item.id);
      return item;
    }
    case "CLASS_GROUP": {
      const input = rawInput as EducationClassGroupInput;
      await Promise.all([
        yearRef(organizationId, input.academicYearId),
        campusRef(organizationId, input.campusId),
        levelRef(organizationId, input.levelId),
        programRef(organizationId, input.programId),
      ]);
      const item = await prisma.enterpriseEducationClassGroup.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_CLASS_GROUP_CREATED", "EnterpriseEducationClassGroup", item.id);
      return item;
    }
    case "SUBJECT": {
      const input = rawInput as EducationSubjectInput;
      await departmentRef(organizationId, input.departmentId);
      const item = await prisma.enterpriseEducationSubject.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_SUBJECT_CREATED", "EnterpriseEducationSubject", item.id);
      return item;
    }
    case "COURSE_OFFERING": {
      const input = rawInput as EducationCourseOfferingInput;
      const [year, period, campus, subject, classGroup, program, level] = await Promise.all([
        yearRef(organizationId, input.academicYearId),
        periodRef(organizationId, input.periodId, input.academicYearId),
        campusRef(organizationId, input.campusId),
        subjectRef(organizationId, input.subjectId),
        classGroupRef(organizationId, input.classGroupId),
        programRef(organizationId, input.programId),
        levelRef(organizationId, input.levelId),
      ]);
      if (!year || !campus || !subject) throw new EnterpriseDomainError("EDUCATION_REFERENCE_INVALID", 409);
      if (period && period.academicYearId !== year.id) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
      if (classGroup && (classGroup.academicYearId !== year.id || classGroup.campusId !== campus.id)) throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
      if (classGroup?.programId && program && classGroup.programId !== program.id) throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
      if (classGroup?.levelId && level && classGroup.levelId !== level.id) throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
      const item = await prisma.enterpriseEducationCourseOffering.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_COURSE_OFFERING_CREATED", "EnterpriseEducationCourseOffering", item.id);
      return item;
    }
    case "CALENDAR_EVENT": {
      const input = rawInput as EducationCalendarEventInput;
      const [year, period] = await Promise.all([
        yearRef(organizationId, input.academicYearId),
        periodRef(organizationId, input.periodId, input.academicYearId),
        campusRef(organizationId, input.campusId),
      ]);
      if (input.startsAt < year.startDate || input.endsAt > year.endDate) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
      if (period && (input.startsAt < period.startDate || input.endsAt > period.endDate)) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
      const item = await prisma.enterpriseEducationCalendarEvent.create({ data: { organizationId, ...input, createdByUserId: userId } });
      await writeEducationAudit(userId, organizationId, "EDUCATION_CALENDAR_EVENT_CREATED", "EnterpriseEducationCalendarEvent", item.id);
      return item;
    }
    case "SETTINGS":
      throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
  }
}

async function assertArchivableYear(organizationId: string, id: string) {
  const [periods, classes, offerings, events] = await Promise.all([
    prisma.enterpriseEducationAcademicPeriod.count({ where: { organizationId, academicYearId: id, archivedAt: null } }),
    prisma.enterpriseEducationClassGroup.count({ where: { organizationId, academicYearId: id, archivedAt: null } }),
    prisma.enterpriseEducationCourseOffering.count({ where: { organizationId, academicYearId: id, archivedAt: null } }),
    prisma.enterpriseEducationCalendarEvent.count({ where: { organizationId, academicYearId: id, archivedAt: null } }),
  ]);
  if (periods + classes + offerings + events > 0) throw new EnterpriseDomainError("EDUCATION_YEAR_IN_USE", 409);
}

async function assertArchivablePeriod(organizationId: string, id: string) {
  const [offerings, events] = await Promise.all([
    prisma.enterpriseEducationCourseOffering.count({ where: { organizationId, periodId: id, archivedAt: null } }),
    prisma.enterpriseEducationCalendarEvent.count({ where: { organizationId, periodId: id, archivedAt: null } }),
  ]);
  if (offerings + events > 0) throw new EnterpriseDomainError("EDUCATION_PERIOD_IN_USE", 409);
}

function statusForAction(action: string) {
  if (action === "ACTIVATE") return "ACTIVE";
  if (action === "DEACTIVATE") return "INACTIVE";
  return null;
}

export async function mutateEducationResource(input: {
  organizationId: string;
  userId: string;
  resource: Exclude<EducationResourceCode, "SETTINGS">;
  id: string;
  action: "UPDATE" | "ARCHIVE" | "ACTIVATE" | "DEACTIVATE" | "CLOSE";
  revision: number;
  data: Record<string, unknown>;
}) {
  const { organizationId, userId, resource, id, action, revision } = input;
  const status = statusForAction(action);
  const archiveData = action === "ARCHIVE" ? { archivedAt: new Date(), status: "ARCHIVED", updatedByUserId: userId, revision: { increment: 1 } } : null;
  const closeData = action === "CLOSE" ? { status: "CLOSED", closedAt: new Date(), updatedByUserId: userId, revision: { increment: 1 } } : null;
  const stateData = status ? { status, updatedByUserId: userId, revision: { increment: 1 } } : null;

  const ensureChanged = (count: number) => {
    if (count !== 1) throw new EnterpriseDomainConflictError();
  };

  switch (resource) {
    case "ACADEMIC_YEAR": {
      const existing = await prisma.enterpriseEducationAcademicYear.findFirst({ where: { id, organizationId, archivedAt: null } });
      if (!existing) throw new EnterpriseDomainError("EDUCATION_RECORD_NOT_FOUND", 404);
      if (action === "ARCHIVE") await assertArchivableYear(organizationId, id);
      if (action === "DEACTIVATE") throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
      const data = action === "UPDATE"
        ? { ...(input.data as Omit<EducationAcademicYearInput, "revision">), updatedByUserId: userId, revision: { increment: 1 } }
        : archiveData || closeData || stateData;
      if (!data) throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
      const result = await prisma.enterpriseEducationAcademicYear.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data });
      ensureChanged(result.count);
      break;
    }
    case "PERIOD": {
      const existing = await prisma.enterpriseEducationAcademicPeriod.findFirst({ where: { id, organizationId, archivedAt: null } });
      if (!existing) throw new EnterpriseDomainError("EDUCATION_RECORD_NOT_FOUND", 404);
      if (action === "ARCHIVE") await assertArchivablePeriod(organizationId, id);
      if (action === "DEACTIVATE") throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
      if (action === "UPDATE") {
        const value = input.data as EducationPeriodInput;
        const year = await yearRef(organizationId, value.academicYearId);
        if (value.startDate < year.startDate || value.endDate > year.endDate) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
      }
      const data = action === "UPDATE"
        ? { ...(input.data as EducationPeriodInput), updatedByUserId: userId, revision: { increment: 1 } }
        : archiveData || closeData || stateData;
      if (!data) throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
      const result = await prisma.enterpriseEducationAcademicPeriod.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data });
      ensureChanged(result.count);
      break;
    }
    case "CAMPUS":
    case "LEVEL":
    case "DEPARTMENT":
    case "PROGRAM":
    case "CLASS_GROUP":
    case "SUBJECT":
    case "COURSE_OFFERING":
    case "CALENDAR_EVENT": {
      if (action === "CLOSE") throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
      if (action === "UPDATE") {
        if (resource === "DEPARTMENT") await campusRef(organizationId, (input.data as EducationDepartmentInput).campusId);
        if (resource === "PROGRAM") await departmentRef(organizationId, (input.data as EducationProgramInput).departmentId);
        if (resource === "CLASS_GROUP") {
          const value = input.data as EducationClassGroupInput;
          await Promise.all([yearRef(organizationId, value.academicYearId), campusRef(organizationId, value.campusId), levelRef(organizationId, value.levelId), programRef(organizationId, value.programId)]);
        }
        if (resource === "SUBJECT") await departmentRef(organizationId, (input.data as EducationSubjectInput).departmentId);
        if (resource === "COURSE_OFFERING") {
          const value = input.data as EducationCourseOfferingInput;
          const [period, campus, classGroup] = await Promise.all([
            periodRef(organizationId, value.periodId, value.academicYearId),
            campusRef(organizationId, value.campusId),
            classGroupRef(organizationId, value.classGroupId),
            yearRef(organizationId, value.academicYearId),
            subjectRef(organizationId, value.subjectId),
            programRef(organizationId, value.programId),
            levelRef(organizationId, value.levelId),
          ]);
          if (period && period.academicYearId !== value.academicYearId) throw new EnterpriseDomainError("EDUCATION_PERIOD_YEAR_MISMATCH", 409);
          if (classGroup && (classGroup.academicYearId !== value.academicYearId || classGroup.campusId !== campus?.id)) throw new EnterpriseDomainError("EDUCATION_CLASS_SCOPE_MISMATCH", 409);
        }
        if (resource === "CALENDAR_EVENT") {
          const value = input.data as EducationCalendarEventInput;
          await Promise.all([yearRef(organizationId, value.academicYearId), periodRef(organizationId, value.periodId, value.academicYearId), campusRef(organizationId, value.campusId)]);
        }
      }

      const updateData = action === "UPDATE" ? { ...input.data, updatedByUserId: userId, revision: { increment: 1 } } : archiveData || stateData;
      if (!updateData) throw new EnterpriseDomainError("EDUCATION_INPUT_INVALID", 400);
      let count = 0;
      if (resource === "CAMPUS") count = (await prisma.enterpriseEducationCampus.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "LEVEL") count = (await prisma.enterpriseEducationAcademicLevel.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "DEPARTMENT") count = (await prisma.enterpriseEducationDepartment.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "PROGRAM") count = (await prisma.enterpriseEducationProgram.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "CLASS_GROUP") count = (await prisma.enterpriseEducationClassGroup.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "SUBJECT") count = (await prisma.enterpriseEducationSubject.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "COURSE_OFFERING") count = (await prisma.enterpriseEducationCourseOffering.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      if (resource === "CALENDAR_EVENT") count = (await prisma.enterpriseEducationCalendarEvent.updateMany({ where: { id, organizationId, revision, archivedAt: null }, data: updateData })).count;
      ensureChanged(count);
      break;
    }
  }

  await writeEducationAudit(userId, organizationId, `EDUCATION_${resource}_${action}`, `EnterpriseEducation${resource}`, id);
  return { id, resource, action };
}
