import { z } from "zod";
import { HIRMS_ENVIRONMENTS, assertHirmsEnvironmentEnabled, isHirmsProductionApprovedForOrganization, type HirmsEnvironment } from "./environments";
import { prisma } from "@/lib/prisma";
import { sealHirmsCredentials, openHirmsCredentials } from "./crypto";
import { hirmsAdapter } from "./hirms";
import { type InsuranceMemberVerification, InsuranceConnectorError } from "./registry";

export const connectorSettingsSchema = z.object({
  environment: z.enum(HIRMS_ENVIRONMENTS),
  siteId: z.string().cuid().nullable().optional(),
  hslServiceProviderId: z.number().int().positive().nullable().optional(),
  username: z.string().trim().regex(/^hirms-api-[a-zA-Z0-9_-]{32}$/, "Compte HSL invalide").optional(),
  secret: z.string().min(12).max(1000).optional(),
}).strict().refine((value) => Boolean(value.username) === Boolean(value.secret), {
  message: "Le compte et le secret HSL doivent être fournis ensemble.",
});

export const memberVerificationSchema = z.object({
  environment: z.enum(HIRMS_ENVIRONMENTS),
  memberNumber: z.string().trim().min(4).max(100),
  cardReference: z.string().min(6).max(600),
  serviceCode: z.string().trim().min(1).max(80).optional(),
  codeSystem: z.enum(["CPT","CDT","HCPCS","DRUG"]).optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  patientId: z.string().cuid().optional(),
}).strict().refine((value) => !value.codeSystem || Boolean(value.serviceCode), {
  message: "Un code de prestation est requis lorsque le système de codification est choisi.",
});

export async function getInsuranceConnectorDashboard(organizationId: string, environment: HirmsEnvironment) {
  const [entry, sites] = await Promise.all([
    prisma.enterpriseHealthInsuranceConnector.findUnique({
      where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment } },
      select: { id: true, adapterCode: true, environment: true, siteId: true, hslServiceProviderId: true, status: true, credentialsEncrypted: true, credentialsUpdatedAt: true, lastAuthCheckAt: true, lastVerifiedAt: true, lastErrorCode: true, revision: true },
    }),
    prisma.enterpriseSite.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);
  return {
    connector: entry ? {
      id: entry.id, adapterCode: entry.adapterCode, environment: entry.environment, siteId: entry.siteId, hslServiceProviderId: entry.hslServiceProviderId,
      status: entry.status, credentialsConfigured: Boolean(entry.credentialsEncrypted), credentialsUpdatedAt: entry.credentialsUpdatedAt,
      lastAuthCheckAt: entry.lastAuthCheckAt, lastVerifiedAt: entry.lastVerifiedAt, lastErrorCode: entry.lastErrorCode, revision: entry.revision,
    } : null,
    sites, environment,
    productionEnabled: process.env.HEALTH_INSURANCE_HIRMS_PRODUCTION_ENABLED === "true" && isHirmsProductionApprovedForOrganization(organizationId),
    uatInvoiceSendEnabled: process.env.HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED === "true",
    productionInvoiceSendEnabled: process.env.HEALTH_INSURANCE_HIRMS_PRODUCTION_ENABLED === "true" && isHirmsProductionApprovedForOrganization(organizationId) && process.env.HEALTH_INSURANCE_HIRMS_PRODUCTION_INVOICE_SEND_ENABLED === "true",
  };
}

export async function saveInsuranceConnector(organizationId: string, userId: string, settings: z.infer<typeof connectorSettingsSchema>) {
  const existing = await prisma.enterpriseHealthInsuranceConnector.findUnique({ where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment: settings.environment } } });
  if (settings.siteId) {
    const valid = await prisma.enterpriseSite.findFirst({ where: { organizationId, id: settings.siteId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!valid) throw new InsuranceConnectorError("HEALTH_CONNECTOR_SITE_INVALID", 400);
  }
  if (!settings.username && !existing?.credentialsEncrypted) throw new InsuranceConnectorError("HEALTH_CONNECTOR_CREDENTIALS_REQUIRED", 400);
  const ciphertext = settings.username && settings.secret ? sealHirmsCredentials({ username: settings.username, secret: settings.secret }) : undefined;
  await prisma.enterpriseHealthInsuranceConnector.upsert({
    where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment: settings.environment } },
    create: {
      organizationId, adapterCode: "HIRMS_HSL", environment: settings.environment, siteId: settings.siteId || null,
      status: "DRAFT", hslServiceProviderId: settings.hslServiceProviderId || null, credentialsEncrypted: ciphertext || null, credentialsUpdatedAt: ciphertext ? new Date() : null, createdByUserId: userId,
    },
    update: {
      siteId: settings.siteId === undefined ? existing?.siteId || null : settings.siteId,
      hslServiceProviderId: settings.hslServiceProviderId === undefined ? existing?.hslServiceProviderId || null : settings.hslServiceProviderId,
      status: ciphertext || (settings.siteId !== undefined && settings.siteId !== existing?.siteId) || (settings.hslServiceProviderId !== undefined && settings.hslServiceProviderId !== existing?.hslServiceProviderId) ? "DRAFT" : existing?.status || "DRAFT",
      ...(ciphertext ? { credentialsEncrypted: ciphertext, credentialsUpdatedAt: new Date() } : {}),
      updatedByUserId: userId, revision: { increment: 1 },
    },
  });
  return getInsuranceConnectorDashboard(organizationId, settings.environment);
}

export async function checkInsuranceConnector(organizationId: string, environment: HirmsEnvironment) {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  const entry = await prisma.enterpriseHealthInsuranceConnector.findUnique({ where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment } } });
  if (!entry || !entry.credentialsEncrypted) throw new InsuranceConnectorError("HEALTH_CONNECTOR_CREDENTIALS_REQUIRED", 409);

  const credentials = openHirmsCredentials(entry.credentialsEncrypted);
  await hirmsAdapter.checkConnection(credentials, environment, organizationId);
  await prisma.enterpriseHealthInsuranceConnector.update({ where: { id: entry.id }, data: { lastAuthCheckAt: new Date(), lastErrorCode: null, status: "READY" } });
  return { ok: true };
}

export async function verifyInsuranceMember(organizationId: string, userId: string, data: z.infer<typeof memberVerificationSchema>) {
  assertHirmsEnvironmentEnabled(data.environment, organizationId);
  const entry = await prisma.enterpriseHealthInsuranceConnector.findUnique({ where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment: data.environment } } });
  if (!entry || entry.status !== "READY" || !entry.credentialsEncrypted) throw new InsuranceConnectorError("HEALTH_CONNECTOR_NOT_READY", 409);

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
  const result = await hirmsAdapter.verify(openHirmsCredentials(entry.credentialsEncrypted), input, data.environment, organizationId);
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
