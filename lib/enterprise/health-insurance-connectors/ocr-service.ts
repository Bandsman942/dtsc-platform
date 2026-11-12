import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { openHirmsCredentials } from "./crypto";
import { InsuranceConnectorError } from "./registry";
import { assertHirmsEnvironmentEnabled, assertHirmsOcrUploadEnabled, type HirmsEnvironment } from "./environments";
import { HirmsOcrTransportError, HIRMS_OCR_PROXY_MAX_BYTES, uploadHirmsOcrDocument, checkHirmsOcrJob } from "./hirms-ocr";

type OcrMime = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
function reject(code: string, status = 409): never { throw new InsuranceConnectorError(code, status); }
function sniffMime(bytes: Uint8Array): OcrMime | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)) return "image/png";
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseInvoiceDate(value: string) {
  // Validate a calendar date as a civil day, never converting it to UTC.
  const parts = dateOnly.exec(value);
  if (!parts) reject("HIRMS_OCR_INVOICE_DATE_INVALID", 400);
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    reject("HIRMS_OCR_INVOICE_DATE_INVALID", 400);
  }
  return value;
}

export async function uploadHirmsOcrForTenant(
  organizationId: string, userId: string, environment: HirmsEnvironment,
  file: File, invoiceDate: string, salesInvoiceId?: string,
) {
  assertHirmsOcrUploadEnabled(environment, organizationId);
  parseInvoiceDate(invoiceDate);
  if (file.size < 1 || file.size > HIRMS_OCR_PROXY_MAX_BYTES) reject("HIRMS_OCR_PROXY_FILE_TOO_LARGE", 413);
  const declared = file.type;
  if (!["application/pdf","image/png","image/jpeg","image/webp"].includes(declared)) reject("HIRMS_OCR_TYPE_UNSUPPORTED", 415);
  const buffer = new Uint8Array(await file.arrayBuffer());
  const actual = sniffMime(buffer);
  if (!actual || actual !== declared) reject("HIRMS_OCR_FILE_SIGNATURE_INVALID", 415);
  if (salesInvoiceId) {
    const invoice = await prisma.enterpriseSalesInvoice.findFirst({
      where: { organizationId, id: salesInvoiceId, archivedAt: null, issuedAt: { not: null } },
      select: { id: true },
    });
    if (!invoice) reject("HIRMS_OCR_ERP_INVOICE_NOT_FOUND", 404);
  }
  const connector = await prisma.enterpriseHealthInsuranceConnector.findUnique({
    where: { organizationId_adapterCode_environment: { organizationId, adapterCode: "HIRMS_HSL", environment } },
    select: { id: true, status: true, credentialsEncrypted: true },
  });
  if (!connector || connector.status !== "READY" || !connector.credentialsEncrypted)
    reject("HIRMS_CONNECTOR_NOT_AUTHORIZED", 409);
  const digest = createHash("sha256").update(buffer).digest("hex");
  let job: { id: string };
  try {
    job = await prisma.enterpriseHealthInsuranceOcrJob.create({
      data: {
        organizationId, connectorId: connector.id, adapterCode: "HIRMS_HSL", environment,
        salesInvoiceId: salesInvoiceId || null, documentDigest: digest,
        mimeType: actual, bytes: buffer.byteLength, invoiceDate, createdByUserId: userId,
        transportStatus: "UPLOADING",
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      reject("HIRMS_OCR_DOCUMENT_ALREADY_SENT_OR_UNRESOLVED", 409);
    throw error;
  }
  try {
    const result = await uploadHirmsOcrDocument(openHirmsCredentials(connector.credentialsEncrypted),
      environment, organizationId, buffer, actual, invoiceDate);
    const transportStatus = result.jobId ? (result.httpStatus===202 ? "QUEUED" : "RECEIVED") : "REFERENCE_UNCONFIRMED";
    await prisma.enterpriseHealthInsuranceOcrJob.updateMany({
      where: { id: job.id, organizationId, environment, connectorId: connector.id },
      data: { transportStatus, externalJobId: result.jobId, remoteStatus: result.remoteStatus,
        httpStatus: result.httpStatus, errorCode: result.jobId ? null : "HIRMS_OCR_JOB_ID_UNCONFIRMED" },
    });
    return {
      ok: true, id: job.id, environment, transportStatus,
      hasExternalJob: Boolean(result.jobId),
      message: result.jobId
        ? "Document accepté techniquement par HSL. Vérifiez le statut OCR ; aucune facture ou décision de paiement n'a été créée."
        : "HSL a répondu, mais la référence du traitement OCR est à certifier. Ne renvoyez pas ce document avant rapprochement.",
    };
  } catch (error) {
    const known = error instanceof HirmsOcrTransportError;
    const status = known && !error.unknownOutcome ? "REJECTED" : "UNKNOWN_OUTCOME";
    const code = error instanceof InsuranceConnectorError ? error.code : "HIRMS_OCR_OUTCOME_UNKNOWN";
    await prisma.enterpriseHealthInsuranceOcrJob.updateMany({
      where: { id: job.id, organizationId, environment, connectorId: connector.id },
      data: { transportStatus: status, errorCode: code, httpStatus: known ? error.httpStatus : null },
    });
    if (error instanceof InsuranceConnectorError) throw error;
    reject("HIRMS_OCR_OUTCOME_UNKNOWN", 503);
  }
}
export async function listHirmsOcrJobs(organizationId: string, environment: HirmsEnvironment, page = 1) {
  const safePage = Math.min(10000, Math.max(1, Math.floor(page) || 1));
  const where = { organizationId, environment, adapterCode: "HIRMS_HSL" };
  const [total, items] = await Promise.all([
    prisma.enterpriseHealthInsuranceOcrJob.count({ where }),
    prisma.enterpriseHealthInsuranceOcrJob.findMany({
      where, orderBy: { submittedAt: "desc" }, skip: (safePage-1)*20, take: 20,
      select: {
        id: true, salesInvoiceId: true, mimeType: true, bytes: true, invoiceDate: true,
        externalJobId: true, transportStatus: true, remoteStatus: true, errorCode: true,
        lastPolledAt: true, submittedAt: true,
      },
    }),
  ]);
  return { total, page: safePage, pageCount: Math.max(1, Math.ceil(total/20)), items };
}
export async function pollHirmsOcrJob(organizationId: string, environment: HirmsEnvironment, jobId: string) {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  const job = await prisma.enterpriseHealthInsuranceOcrJob.findFirst({
    where: { id: jobId, organizationId, environment, adapterCode: "HIRMS_HSL" },
    select: { id: true, externalJobId: true, connectorId: true },
  });
  if (!job) reject("HIRMS_OCR_JOB_NOT_FOUND", 404);
  if (!job.externalJobId) reject("HIRMS_OCR_JOB_ID_UNCONFIRMED", 409);
  const connector = await prisma.enterpriseHealthInsuranceConnector.findFirst({
    where: { id: job.connectorId, organizationId, environment, status: "READY" },
    select: { credentialsEncrypted: true },
  });
  if (!connector?.credentialsEncrypted) reject("HIRMS_CONNECTOR_NOT_AUTHORIZED", 409);
  try {
    const status = await checkHirmsOcrJob(openHirmsCredentials(connector.credentialsEncrypted),
      environment, organizationId, job.externalJobId);
    await prisma.enterpriseHealthInsuranceOcrJob.updateMany({
      where: { id: job.id, organizationId, environment, connectorId: job.connectorId },
      data: { remoteStatus: status.remoteStatus, lastPolledAt: new Date(),
        errorCode: status.remoteStatus ? null : "HIRMS_OCR_STATUS_SCHEMA_UNCONFIRMED" },
    });
    return { ok: true, environment, remoteStatus: status.remoteStatus, schemaRecognized: Boolean(status.remoteStatus),
      message: status.remoteStatus
        ? "État du traitement OCR actualisé. Aucun résultat clinique n'est considéré comme validé."
        : "HSL a répondu, mais le schéma de l'état OCR doit être confirmé." };
  } catch (error) {
    await prisma.enterpriseHealthInsuranceOcrJob.updateMany({
      where: { id: job.id, organizationId, environment, connectorId: job.connectorId },
      data: { lastPolledAt: new Date(), errorCode: error instanceof InsuranceConnectorError ? error.code : "HIRMS_OCR_POLL_UNAVAILABLE" },
    });
    throw error;
  }
}
