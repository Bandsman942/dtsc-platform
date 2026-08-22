import type { Prisma } from "@prisma/client";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";

export type EnterpriseModuleAccessRestriction = {
  userId: string;
  moduleCode: string;
  blockedUntil: string;
  reason: string;
  createdAt: string;
  createdByUserId: string;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function restrictionFromUnknown(value: unknown): EnterpriseModuleAccessRestriction | null {
  const candidate = jsonObject(value);
  const userId = typeof candidate.userId === "string" ? candidate.userId : "";
  const moduleCode = typeof candidate.moduleCode === "string" ? normalizeEnterpriseModuleCode(candidate.moduleCode) : "";
  const blockedUntil = typeof candidate.blockedUntil === "string" ? candidate.blockedUntil : "";
  const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";
  const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : "";
  const createdByUserId = typeof candidate.createdByUserId === "string" ? candidate.createdByUserId : "";
  if (!userId || !moduleCode || !blockedUntil || !reason) return null;
  return { userId, moduleCode, blockedUntil, reason, createdAt, createdByUserId };
}

export function readEnterpriseModuleAccessRestrictions(settingsJson: Prisma.JsonValue | null | undefined) {
  const settings = jsonObject(settingsJson);
  const enterpriseAdmin = jsonObject(settings.enterpriseAdmin);
  const source = Array.isArray(enterpriseAdmin.moduleAccessRestrictions) ? enterpriseAdmin.moduleAccessRestrictions : [];
  return source.map(restrictionFromUnknown).filter((item): item is EnterpriseModuleAccessRestriction => Boolean(item));
}

export function getActiveEnterpriseModuleRestriction(
  settingsJson: Prisma.JsonValue | null | undefined,
  userId: string,
  moduleCode: string,
  now = new Date(),
) {
  const canonicalCode = normalizeEnterpriseModuleCode(moduleCode);
  return readEnterpriseModuleAccessRestrictions(settingsJson).find((restriction) => {
    const until = new Date(restriction.blockedUntil);
    return restriction.userId === userId && restriction.moduleCode === canonicalCode && Number.isFinite(until.getTime()) && until > now;
  }) || null;
}

export function writeEnterpriseModuleAccessRestriction({
  settingsJson,
  restriction,
}: {
  settingsJson: Prisma.JsonValue | null | undefined;
  restriction: EnterpriseModuleAccessRestriction | null;
}) {
  const settings = jsonObject(settingsJson);
  const enterpriseAdmin = jsonObject(settings.enterpriseAdmin);
  const current = readEnterpriseModuleAccessRestrictions(settingsJson);
  const next = restriction
    ? [
        ...current.filter((item) => !(item.userId === restriction.userId && item.moduleCode === restriction.moduleCode)),
        restriction,
      ]
    : current;
  return {
    ...settings,
    enterpriseAdmin: {
      ...enterpriseAdmin,
      moduleAccessRestrictions: next,
    },
  } as Prisma.InputJsonValue;
}

export function removeEnterpriseModuleAccessRestriction({
  settingsJson,
  userId,
  moduleCode,
}: {
  settingsJson: Prisma.JsonValue | null | undefined;
  userId: string;
  moduleCode: string;
}) {
  const settings = jsonObject(settingsJson);
  const enterpriseAdmin = jsonObject(settings.enterpriseAdmin);
  const canonicalCode = normalizeEnterpriseModuleCode(moduleCode);
  const next = readEnterpriseModuleAccessRestrictions(settingsJson).filter(
    (item) => !(item.userId === userId && item.moduleCode === canonicalCode),
  );
  return {
    ...settings,
    enterpriseAdmin: {
      ...enterpriseAdmin,
      moduleAccessRestrictions: next,
    },
  } as Prisma.InputJsonValue;
}
