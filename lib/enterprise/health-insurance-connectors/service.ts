import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sealHirmsCredentials, openHirmsCredentials } from "./crypto";
import { hirmsAdapter } from "./hirms";
import { type InsuranceMemberVerification, InsuranceConnectorError } from "./registry";

export const connectorSettingsSchema = z.object({
  siteId: z.string().cuid().nullable().optional(),
  username: z.string().trim().regex(/^hirms-api-[a-zA-Z0-9_-]{20,64}$/, "Compte HSL invalide").optional(),
  secret: z.string().min(12).max(1000).optional(),
}).strict().refine((value) => Boolean(value.username) === Boolean(value.secret), {
  message: "Le compte et le secret HSL doivent être fournis ensemble.",
});

export const memberVerificationSchema = z.object({
  memberNumber: z.string().trim().min(4).max(100),
  cardReference: z.string().min(6).max(600),
  serviceCode: z.string().trim().min(1).max(80).optional(),
  codeSystem: z.enum(["CPT","CDT","HCPCS","DRUG"]).optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  patientId: z.string().cuid().optional(),
}).strict().refine((value) => !value.codeSystem || Boolean(value.serviceCode), {
  message: "Un code de prestation est requis lorsque le système de codification est choisi.",
});

export async function getInsuranceConnectorDashboard(organizationId: string) {
  const [entry, sites] = await Promise.all([
    prisma.enterpriseHealthInsuranceConnector.findUnique({
      where: { organizationId_adapterCode: { organizationId, adapterCode: "HIRMS_HSL" } },
      select: { id: true, adapterCode: true, environment: true, siteId: true, status: true, credentialsEncrypted: true, credentialsUpdatedAt: true, lastAuthCheckAt: true, lastVerifiedAt: true, lastErrorCode: true, revision: true },
    }),
    prisma.enterpriseSite.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);
  return {
    connector: entry ? {
      id: entry.id, adapterCode: entry.adapterCode, environment: entry.environment, siteId: entry.siteId,
      status: entry.status, credentialsConfigured: Boolean(entry.credentialsEncrypted), credentialsUpdatedAt: entry.credentialsUpdatedAt,
      lastAuthCheckAt: entry.lastAuthCheckAt, lastVerifiedAt: entry.lastVerifiedAt, lastErrorCode: entry.lastErrorCode, revision: entry.revision,
    } : null,
    sites,
  };
}

export async function saveInsuranceConnector(organizationId: string, userId: string, settings: z.infer<typeof connectorSettingsSchema>) {
  const existing = await prisma.enterpriseHealthInsuranceConnector.findUnique({ where: { organizationId_adapterCode: { organizationId, adapterCode: "HIRMS_HSL" } } });
  if (settings.siteId) {
    const valid = await prisma.enterpriseSite.findFirst({ where: { organizationId, id: settings.siteId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!valid) throw new InsuranceConnectorError("HEALTH_CONNECTOR_SITE_INVALID", 400);
  }
  if (!settings.username && !existing?.credentialsEncrypted) throw new InsuranceConnectorError("HEALTH_CONNECTOR_CREDENTIALS_REQUIRED", 400);
  const ciphertext = settings.username && settings.secret ? sealHirmsCredentials({ username: settings.username, secret: settings.secret }) : undefined;
  await prisma.enterpriseHealthInsuranceConnector.upsert({
    where: { organizationId_adapterCode: { organizationId, adapterCode: "HIRMS_HSL" } },
    create: {
      organizationId, adapterCode: "HIRMS_HSL", environment: "UAT", siteId: settings.siteId || null,
      status: "DRAFT", credentialsEncrypted: ciphertext || null, credentialsUpdatedAt: ciphertext ? new Date() : null, createdByUserId: userId,
    },
    update: {
      siteId: settings.siteId === undefined ? existing?.siteId || null : settings.siteId,
      status: ciphertext || (settings.siteId !== undefined && settings.siteId !== existing?.siteId) ? "DRAFT" : existing?.status || "DRAFT",
      ...(ciphertext ? { credentialsEncrypted: ciphertext, credentialsUpdatedAt: new Date() } : {}),
      updatedByUserId: userId, revision: { increment: 1 },
    },
  });
  return getInsuranceConnectorDashboard(organizationId);
}

export async function checkInsuranceConnector(organizationId: string) {
  const entry = await prisma.enterpriseHealthInsuranceConnector.findUnique({ where: { organizationId_adapterCode: { organizationId, adapterCode: "HIRMS_HSL" } } });
  if (!entry || !entry.credentialsEncrypted) throw new InsuranceConnectorError("HEALTH_CONNECTOR_CREDENTIALS_REQUIRED", 409);
  if (entry.environment !== "UAT") throw new InsuranceConnectorError("HEALTH_CONNECTOR_PRODUCTION_NOT_APPROVED", 403);
  const credentials = openHirmsCredentials(entry.credentialsEncrypted);
  await hirmsAdapter.checkConnection(credentials);
  await prisma.enterpriseHealthInsuranceConnector.update({ where: { id: entry.id }, data: { lastAuthCheckAt: new Date(), lastErrorCode: null, status: "READY" } });
  return { ok: true };
}

export async function verifyInsuranceMember(organizationId: string, userId: string, data: z.infer<typeof memberVerificationSchema>) {
  const entry = await prisma.enterpriseHealthInsuranceConnector.findUnique({ where: { organizationId_adapterCode: { organizationId, adapterCode: "HIRMS_HSL" } } });
  if (!entry || entry.status !== "READY" || !entry.credentialsEncrypted) throw new InsuranceConnectorError("HEALTH_CONNECTOR_NOT_READY", 409);
  if (entry.environment !== "UAT") throw new InsuranceConnectorError("HEALTH_CONNECTOR_PRODUCTION_NOT_APPROVED", 403);
  if (data.patientId) {
    const patient = await prisma.healthPatient.findFirst({ where: { organizationId, id: data.patientId }, select: { id: true } });
    if (!patient) throw new InsuranceConnectorError("HEALTH_CONNECTOR_PATIENT_INVALID", 400);
  }
  const input: InsuranceMemberVerification = {
    memberNumber: data.memberNumber, cardReference: data.cardReference,
    ...(data.serviceCode ? { serviceCode: data.serviceCode } : {}),
    ...(data.codeSystem ? { codeSystem: data.codeSystem } : {}),
    ...(data.serviceDate ? { serviceDate: data.serviceDate } : {}),
  };
  const result = await hirmsAdapter.verify(openHirmsCredentials(entry.credentialsEncrypted), input);
  await prisma.$transaction([
    prisma.enterpriseHealthInsuranceVerification.create({ data: {
      organizationId, connectorId: entry.id, patientId: data.patientId || null,
      memberLastFour: data.memberNumber.slice(-4), serviceCode: data.serviceCode || null,
      codeSystem: data.codeSystem || null, serviceDate: data.serviceDate || null,
      verified: result.verified, coverStatus: result.cover, serviceStatus: result.service,
      networkStatus: result.network, createdByUserId: userId,
    } }),
    prisma.enterpriseHealthInsuranceConnector.update({ where: { id: entry.id }, data: { lastVerifiedAt: new Date(), lastErrorCode: null } }),
  ]);
  return result;
}
