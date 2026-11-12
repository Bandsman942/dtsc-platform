import { InsuranceConnectorError } from "./registry";
import { getHirmsAccessToken } from "./hirms";
import type { HirmsInvoice, HirmsInvoiceBulk } from "./invoice-contract";

type Credentials = { username: string; secret: string };
type TransportResult = { accepted: boolean; queued: boolean; httpStatus: number; externalReference: string | null };

/**
 * A timeout/5xx/invalid response after transmission has UNKNOWN outcome.
 * Never automatically replay an invoice: HSL might already have accepted it.
 */
export class HirmsInvoiceTransportError extends InsuranceConnectorError {
  constructor(code: string, httpStatus: number, public readonly unknownOutcome: boolean) {
    super(code, httpStatus);
  }
}
const API = "https://hslapi.alatlabs.com";
const MAX_BYTES = 8 * 1024 * 1024; // lower than HSL's 64 MiB request limit (protect Vercel routes)

export async function postHirmsInvoices(credentials: Credentials, invoices: HirmsInvoice | HirmsInvoiceBulk, bulk: boolean): Promise<TransportResult> {
  const json = JSON.stringify(invoices);
  if (Buffer.byteLength(json, "utf8") > MAX_BYTES)
    throw new HirmsInvoiceTransportError("HIRMS_INVOICE_REQUEST_TOO_LARGE", 413, false);
  const endpoint = API + (bulk ? "/api/invoices/bulk" : "/api/invoices");
  let sentAtLeastOnce = false;
  async function send(force = false): Promise<Response> {
    const token = await getHirmsAccessToken(credentials, force);
    sentAtLeastOnce = true;
    try {
      return await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Language": "fr",
        },
        body: json,
      });
    } catch {
      throw new HirmsInvoiceTransportError("HIRMS_INVOICE_OUTCOME_UNKNOWN", 503, true);
    }
  }
  let response: Response;
  try {
    response = await send();
    if (response.status === 401) response = await send(true); // Rejected unauthorized request, retry once with a new token.
  } catch (error) {
    if (error instanceof HirmsInvoiceTransportError) throw error;
    if (error instanceof InsuranceConnectorError) throw new HirmsInvoiceTransportError(error.code, error.httpStatus, sentAtLeastOnce);
    throw new HirmsInvoiceTransportError("HIRMS_INVOICE_OUTCOME_UNKNOWN", 503, sentAtLeastOnce);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 400 || status === 422) throw new HirmsInvoiceTransportError("HIRMS_INVOICE_CONTRACT_REJECTED", 400, false);
    if (status === 401) throw new HirmsInvoiceTransportError("HIRMS_INVOICE_AUTH_DENIED", 401, false);
    if (status === 403) throw new HirmsInvoiceTransportError("HIRMS_INVOICE_PROVIDER_FORBIDDEN", 403, false);
    if (status === 413) throw new HirmsInvoiceTransportError("HIRMS_INVOICE_TOO_LARGE", 413, false);
    if (status === 429) throw new HirmsInvoiceTransportError("HIRMS_INVOICE_RATE_LIMIT", 429, false);
    throw new HirmsInvoiceTransportError("HIRMS_INVOICE_OUTCOME_UNKNOWN", 503, true);
  }

  // HSL may respond with either an object, a list or no body. Do not infer paid/approved.
  const reply: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  let externalReference: string | null = null;
  if (reply && typeof reply === "object" && !Array.isArray(reply)) {
    const r = reply as Record<string, unknown>;
    const candidate = r.invoiceId ?? r.InvoiceID ?? r.id ?? r.reference;
    if (typeof candidate === "string" && candidate.length > 0 && candidate.length < 150)
      externalReference = candidate;
  }
  return { accepted: true, queued: response.status === 202, httpStatus: response.status, externalReference };
}
