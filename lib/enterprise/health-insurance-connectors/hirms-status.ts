import { z } from "zod";
import { assertHirmsEnvironmentEnabled, hirmsEndpoints, type HirmsEnvironment } from "./environments";
import { getHirmsAccessToken } from "./hirms";
import { InsuranceConnectorError } from "./registry";

type Credentials = { username: string; secret: string };
const remoteCode = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

/** HSL's response schema is not yet certified. Only return a safe status *code*;
 * no raw provider payload, names, treatments, amounts or reimbursement decisions.
 */
function extractStatus(response: unknown): string | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const value = response as Record<string, unknown>;
  const nested = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data as Record<string, unknown> : null;
  const code = value.status ?? value.Status ?? value.processingStatus ?? value.invoiceStatus
    ?? value.InvoiceStatus ?? nested?.status ?? nested?.Status;
  const parsed = remoteCode.safeParse(code);
  return parsed.success ? parsed.data : null;
}
export async function getHirmsRemoteInvoiceStatus(
  credentials: Credentials, environment: HirmsEnvironment, organizationId: string, reference: string,
): Promise<{ remoteStatus: string | null; httpStatus: number; schemaRecognized: boolean }> {
  assertHirmsEnvironmentEnabled(environment, organizationId);
  if (!reference || reference.length > 180 || /[\\/\x00-\x1F]/.test(reference))
    throw new InsuranceConnectorError("HIRMS_INVOICE_STATUS_REFERENCE_INVALID", 400);
  const endpoint = hirmsEndpoints(environment).api + "/api/invoices/status/" + encodeURIComponent(reference);
  const request = async (force = false): Promise<Response> => {
    const token = await getHirmsAccessToken(credentials, environment, organizationId, force);
    try {
      return await fetch(endpoint, {
        method: "GET", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "fr" },
      });
    } catch {
      throw new InsuranceConnectorError("HIRMS_INVOICE_STATUS_UNREACHABLE", 503);
    }
  };
  let response = await request();
  if (response.status === 401) response = await request(true);
  if (!response.ok) {
    if (response.status === 401) throw new InsuranceConnectorError("HIRMS_ACCESS_EXPIRED", 401);
    if (response.status === 403) throw new InsuranceConnectorError("HIRMS_ACTION_NOT_GRANTED", 403);
    if (response.status === 404) throw new InsuranceConnectorError("HIRMS_INVOICE_STATUS_NOT_FOUND", 404);
    if (response.status === 429) throw new InsuranceConnectorError("HIRMS_RATE_LIMITED", 429);
    throw new InsuranceConnectorError("HIRMS_INVOICE_STATUS_UNAVAILABLE", 502);
  }
  const body: unknown = await response.json().catch(() => null);
  const status = extractStatus(body);
  return { remoteStatus: status, httpStatus: response.status, schemaRecognized: status !== null };
}
