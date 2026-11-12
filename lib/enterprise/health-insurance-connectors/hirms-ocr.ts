import { z } from "zod";
import { InsuranceConnectorError } from "./registry";
import { assertHirmsEnvironmentEnabled, hirmsEndpoints, type HirmsEnvironment } from "./environments";
import { getHirmsAccessToken } from "./hirms";

type Credentials = { username: string; secret: string };
const remoteId = z.string().trim().min(1).max(180).regex(/^[A-Za-z0-9_-]+$/);
const statusCode = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const HIRMS_OCR_PROXY_MAX_BYTES = 4 * 1024 * 1024; // conservative Vercel request limit

export class HirmsOcrTransportError extends InsuranceConnectorError {
  constructor(code: string, status: number, public readonly unknownOutcome: boolean) {
    super(code, status);
  }
}
function safeSummary(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { jobId: null, remoteStatus: null };
  const value = body as Record<string, unknown>;
  const nested = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data as Record<string, unknown> : {};
  const jobId = remoteId.safeParse(value.jobId ?? value.JobId ?? value.job_id ?? nested.jobId ?? nested.job_id);
  const status = statusCode.safeParse(value.status ?? value.Status ?? nested.status);
  return { jobId: jobId.success ? jobId.data : null, remoteStatus: status.success ? status.data : null };
}
async function callWithOauth(credentials: Credentials, environment: HirmsEnvironment, organizationId: string, perform: (token: string) => Promise<Response>) {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  const request = async (force: boolean) => {
    const token = await getHirmsAccessToken(credentials, environment, organizationId, force);
    try { return await perform(token); }
    catch { throw new HirmsOcrTransportError("HIRMS_OCR_OUTCOME_UNKNOWN", 503, true); }
  };
  let response = await request(false);
  if (response.status === 401) response = await request(true);
  return response;
}
export async function uploadHirmsOcrDocument(
  credentials: Credentials, environment: HirmsEnvironment, organizationId: string,
  bytes: Uint8Array, mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp", invoiceDate: string,
) {
  if (bytes.byteLength < 1 || bytes.byteLength > HIRMS_OCR_PROXY_MAX_BYTES) {
    throw new HirmsOcrTransportError("HIRMS_OCR_FILE_SIZE_INVALID", 413, false);
  }
  const form = new FormData();
  const name = mime === "application/pdf" ? "document.pdf" : mime === "image/png" ? "document.png" : mime === "image/webp" ? "document.webp" : "document.jpg";
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  form.append("invoiceDate", invoiceDate);
  const response = await callWithOauth(credentials, environment, organizationId, (token) =>
    fetch(hirmsEndpoints(environment).api + "/api/ocr/documents", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
    }),
  );
  if (!response.ok) {
    const status = response.status;
    if ([400, 413, 415, 422].includes(status)) throw new HirmsOcrTransportError("HIRMS_OCR_DOCUMENT_REJECTED", 400, false);
    if ([401, 403].includes(status)) throw new HirmsOcrTransportError("HIRMS_OCR_ACCESS_DENIED", 403, false);
    if (status === 429) throw new HirmsOcrTransportError("HIRMS_OCR_RATE_LIMIT", 429, false);
    throw new HirmsOcrTransportError("HIRMS_OCR_OUTCOME_UNKNOWN", 503, true);
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  const summary = safeSummary(body);
  return { ...summary, httpStatus: response.status };
}
export async function checkHirmsOcrJob(credentials: Credentials, environment: HirmsEnvironment, organizationId: string, jobId: string) {
  const parsed = remoteId.safeParse(jobId);
  if (!parsed.success) throw new InsuranceConnectorError("HIRMS_OCR_JOB_REFERENCE_INVALID", 400);
  const response = await callWithOauth(credentials, environment, organizationId, (token) =>
    fetch(hirmsEndpoints(environment).api + "/api/ocr/jobs/" + encodeURIComponent(parsed.data), {
      method: "GET", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }),
  );
  if (!response.ok) {
    if (response.status === 404) throw new InsuranceConnectorError("HIRMS_OCR_JOB_NOT_FOUND", 404);
    if (response.status === 401 || response.status === 403) throw new InsuranceConnectorError("HIRMS_OCR_ACCESS_DENIED", 403);
    if (response.status === 429) throw new InsuranceConnectorError("HIRMS_OCR_RATE_LIMIT", 429);
    throw new InsuranceConnectorError("HIRMS_OCR_POLL_UNAVAILABLE", 503);
  }
  const body: unknown = await response.json().catch(() => null);
  return { ...safeSummary(body), httpStatus: response.status };
}
