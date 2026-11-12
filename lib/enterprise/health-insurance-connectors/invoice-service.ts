import { createHash, randomUUID } from "node:crypto";
import { assertHirmsInvoiceSendEnabled, type HirmsEnvironment } from "./environments";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { openHirmsCredentials } from "./crypto";
import { type HirmsInvoice, hirmsInvoiceSchema, hirmsInvoiceBulkSchema } from "./invoice-contract";
import { InsuranceConnectorError } from "./registry";
import { postHirmsInvoices, HirmsInvoiceTransportError } from "./hirms-invoices";
import { assertHirmsEnvironmentEnabled } from "./environments";
import { getHirmsRemoteInvoiceStatus } from "./hirms-status";

export type HirmsDispatchMode = "single" | "bulk";

type Validated = { invoices: HirmsInvoice[]; connectorId: string; environment: HirmsEnvironment; sourceType: string; credentials: string };

function reject(code: string, httpStatus = 409): never {
  throw new InsuranceConnectorError(code, httpStatus);
}
function equivalent(a: Prisma.Decimal | number, b: number) {
  try { return new Prisma.Decimal(a).eq(new Prisma.Decimal(b)); } catch { return false; }
}

async function validateAgainstErp(organizationId: string, environment: HirmsEnvironment, mode: HirmsDispatchMode, input: unknown): Promise<Validated> {
  const parsed = mode === "bulk" ? hirmsInvoiceBulkSchema.safeParse(input) : hirmsInvoiceSchema.safeParse(input);
  if (!parsed.success) reject("HIRMS_INVOICE_JSON_INVALID", 400);
  const invoices = (mode === "bulk" ? parsed.data : [parsed.data]) as HirmsInvoice[];
  if (!invoices.length || invoices.length > 500) reject("HIRMS_INVOICE_BATCH_SIZE_INVALID", 400);
  const connector = await prisma.enterpriseHealthInsuranceConnector.findUnique({
    where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment } },
  });
  if (!connector || !connector.credentialsEncrypted || connector.status !== "READY" || connector.environment !== environment)
    reject("HIRMS_CONNECTOR_NOT_AUTHORIZED", 409);
  if (!connector.hslServiceProviderId || connector.hslServiceProviderId <= 0)
    reject("HIRMS_SERVICE_PROVIDER_MAPPING_REQUIRED", 409);

  const org = await prisma.organization.findFirst({
    where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null, sectorCode: { in: ["HEALTH_CARE", "PHARMACY"] } },
    select: { sectorCode: true },
  });
  if (!org?.sectorCode) reject("HIRMS_SECTOR_NOT_SUPPORTED", 403);
  if (connector.siteId) {
    const site = await prisma.enterpriseSite.findFirst({ where: { organizationId, id: connector.siteId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!site) reject("HIRMS_SITE_BINDING_INVALID", 409);
  }

  const ids = invoices.map(i => i.InvoiceID);
  if (new Set(ids).size !== ids.length) reject("HIRMS_DUPLICATE_INVOICE_IN_BATCH", 400);
  const rows = await prisma.enterpriseSalesInvoice.findMany({
    where: { organizationId, id: { in: ids }, archivedAt: null },
    include: { items: { select: { id: true, quantity: true, totalAmount: true } } },
  });
  if (rows.length !== invoices.length) reject("HIRMS_ERP_INVOICE_NOT_FOUND", 404);
  const links = org.sectorCode === "HEALTH_CARE"
    ? await prisma.healthBillingExtension.findMany({ where: { organizationId, salesInvoiceId: { in: ids }, syncStatus: "SYNCED" }, select: { salesInvoiceId: true } })
    : await prisma.pharmacySalesExtension.findMany({ where: { organizationId, salesInvoiceId: { in: ids }, syncStatus: "SYNCED" }, select: { salesInvoiceId: true } });
  if (links.length !== invoices.length) reject("HIRMS_SECTOR_INVOICE_LINK_REQUIRED", 409);
  const invoiceById = new Map(rows.map(i=>[i.id,i]));
  for (const invoice of invoices) {
    const original = invoiceById.get(invoice.InvoiceID);
    if (!original) reject("HIRMS_ERP_INVOICE_NOT_FOUND", 404);
    if (!original.issuedAt || original.status === "DRAFT" || original.status === "CANCELLED")
      reject("HIRMS_ERP_INVOICE_NOT_ISSUED", 409);
    if (invoice.ServiceProviderID !== connector.hslServiceProviderId)
      reject("HIRMS_SERVICE_PROVIDER_MISMATCH", 409);
    if (invoice.InvoiceNumber !== original.number || invoice.Currency !== original.currencyCode)
      reject("HIRMS_ERP_INVOICE_IDENTITY_MISMATCH", 409);
    if (Date.parse(invoice.InvoiceDate) !== original.invoiceDate.getTime())
      reject("HIRMS_INVOICE_DATE_MISMATCH", 409);
    if (!equivalent(original.grandTotal, invoice.ClaimAmount))
      reject("HIRMS_ERP_INVOICE_AMOUNT_MISMATCH", 409);
    if (invoice.InvoiceItems.length !== original.items.length)
      reject("HIRMS_ERP_INVOICE_LINES_MISMATCH", 409);
    const lines = new Map(original.items.map(item=>[item.id,item]));
    for (const item of invoice.InvoiceItems) {
      const line = lines.get(item.ItemId);
      if (!line || !equivalent(line.quantity, item.Qty)) reject("HIRMS_ERP_INVOICE_LINE_INVALID", 409);
      // HSL's Amount semantics (unit or line amount) are not specified by the sample.
      // Do not guess a conversion here. QA/UAT will certify the mapping.
    }
    const existing = await prisma.enterpriseHealthInsuranceInvoiceSubmission.findUnique({
      where: { organizationId_adapterCode_environment_salesInvoiceId: { organizationId, adapterCode: "HIRMS_HSL", environment, salesInvoiceId: invoice.InvoiceID } },
      select: { transportStatus: true },
    });
    if (existing) reject("HIRMS_INVOICE_ALREADY_TRANSMITTED_OR_UNRESOLVED", 409);
  }
  return { invoices, connectorId: connector.id, environment, sourceType: org.sectorCode, credentials: connector.credentialsEncrypted };
}

export async function preflightHirmsInvoiceSubmission(organizationId: string, environment: HirmsEnvironment, mode: HirmsDispatchMode, input: unknown) {
  const validation = await validateAgainstErp(organizationId, environment, mode, input);
  return {
    ok: true, environment, mode, count: validation.invoices.length,
    invoiceNumbers: validation.invoices.map(i=>i.InvoiceNumber),
    message: `Factures liées à l'ERP et prêtes pour une transmission ${environment} après confirmation.`,
  };
}

export async function submitHirmsInvoices(organizationId: string, userId: string, environment: HirmsEnvironment, mode: HirmsDispatchMode, input: unknown) {
  assertHirmsInvoiceSendEnabled(environment, organizationId);
  const validated = await validateAgainstErp(organizationId, environment, mode, input);
  const batchId = randomUUID();
  const digest = (invoice: HirmsInvoice) => createHash("sha256").update(JSON.stringify(invoice)).digest("hex");
  // Unique key makes retries and concurrent submissions fail closed instead of charging twice.
  try {
    await prisma.enterpriseHealthInsuranceInvoiceSubmission.createMany({
      data: validated.invoices.map(invoice=>({
        organizationId, connectorId: validated.connectorId, adapterCode: "HIRMS_HSL", environment,
        salesInvoiceId: invoice.InvoiceID, invoiceNumber: invoice.InvoiceNumber,
        batchId, payloadDigest: digest(invoice), transportStatus: "SENDING", createdByUserId: userId,
      })),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      reject("HIRMS_INVOICE_ALREADY_TRANSMITTED_OR_UNRESOLVED", 409);
    throw error;
  }
  try {
    const result = await postHirmsInvoices(openHirmsCredentials(validated.credentials),
      mode === "bulk" ? validated.invoices : validated.invoices[0], mode === "bulk", environment, organizationId);
    const status = result.queued ? "QUEUED" : "RECEIVED";
    await prisma.enterpriseHealthInsuranceInvoiceSubmission.updateMany({
      where: { organizationId, connectorId: validated.connectorId, environment, batchId },
      data: { transportStatus: status, httpStatus: result.httpStatus, externalReference: result.externalReference },
    });
    return { ok: true, environment, batchId, count: validated.invoices.length, transportStatus: status, httpStatus: result.httpStatus,
      message: "Réception technique HIRMS enregistrée. Aucune décision de remboursement ou paiement n'est présumée." };
  } catch (error) {
    const expected = error instanceof HirmsInvoiceTransportError;
    const code = expected ? error.code : "HIRMS_INVOICE_OUTCOME_UNKNOWN";
    const status = expected && !error.unknownOutcome ? "REJECTED" : "UNKNOWN_OUTCOME";
    await prisma.enterpriseHealthInsuranceInvoiceSubmission.updateMany({
      where: { organizationId, connectorId: validated.connectorId, environment, batchId },
      data: { transportStatus: status, httpStatus: expected ? error.httpStatus : null, errorCode: code },
    });
    if (expected) throw error;
    reject("HIRMS_INVOICE_OUTCOME_UNKNOWN", 503);
  }
}

export async function listHirmsInvoiceSubmissions(organizationId: string, environment: HirmsEnvironment, page = 1) {
  const safePage = Math.min(Math.max(1,Math.floor(page) || 1),10000);
  const where = { organizationId, adapterCode: "HIRMS_HSL", environment };
  const [total,items] = await Promise.all([
    prisma.enterpriseHealthInsuranceInvoiceSubmission.count({ where }),
    prisma.enterpriseHealthInsuranceInvoiceSubmission.findMany({
      where, orderBy: { submittedAt: "desc" }, skip: (safePage-1)*20, take: 20,
      select: { id: true, invoiceNumber: true, batchId: true, transportStatus: true, httpStatus: true,
        errorCode: true, externalReference: true, remoteStatus: true, lastStatusCheckedAt: true, lastStatusErrorCode: true, submittedAt: true },
    }),
  ]);
  return { items, total, page: safePage, pageCount: Math.max(1,Math.ceil(total/20)) };
}

/** Explicit manual remote-status read. Never converts an HSL code into payment,
 * coverage, credit allocation or a journal entry.
 */
export async function reconcileHirmsInvoiceStatus(
  organizationId: string, environment: HirmsEnvironment, submissionId: string,
) {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  const row = await prisma.enterpriseHealthInsuranceInvoiceSubmission.findFirst({
    where: { organizationId, adapterCode: "HIRMS_HSL", environment, id: submissionId },
    select: { id: true, salesInvoiceId: true, externalReference: true, connectorId: true },
  });
  if (!row) reject("HIRMS_INVOICE_SUBMISSION_NOT_FOUND", 404);
  const connector = await prisma.enterpriseHealthInsuranceConnector.findFirst({
    where: { id: row.connectorId, organizationId, environment, adapterCode: "HIRMS_HSL", status: "READY" },
    select: { credentialsEncrypted: true },
  });
  if (!connector?.credentialsEncrypted) reject("HIRMS_CONNECTOR_NOT_AUTHORIZED", 409);
  try {
    const external = await getHirmsRemoteInvoiceStatus(
      openHirmsCredentials(connector.credentialsEncrypted),
      environment, organizationId, row.externalReference || row.salesInvoiceId,
    );
    await prisma.enterpriseHealthInsuranceInvoiceSubmission.updateMany({
      where: { id: row.id, organizationId, environment, connectorId: row.connectorId },
      data: { remoteStatus: external.remoteStatus, lastStatusCheckedAt: new Date(), lastStatusErrorCode: external.schemaRecognized ? null : "HIRMS_STATUS_SCHEMA_UNCONFIRMED" },
    });
    return {
      ok: true, environment, remoteStatus: external.remoteStatus, schemaRecognized: external.schemaRecognized,
      message: external.schemaRecognized
        ? "Code d'état HSL reçu ; ne constitue ni une preuve de paiement, ni une décision d'assurance."
        : "HSL a répondu mais le schéma de statut reste à certifier. Aucune décision métier n'est déduite.",
    };
  } catch (error) {
    await prisma.enterpriseHealthInsuranceInvoiceSubmission.updateMany({
      where: { id: row.id, organizationId, environment, connectorId: row.connectorId },
      data: { lastStatusCheckedAt: new Date(), lastStatusErrorCode: error instanceof InsuranceConnectorError ? error.code : "HIRMS_INVOICE_STATUS_UNAVAILABLE" },
    });
    throw error;
  }
}
