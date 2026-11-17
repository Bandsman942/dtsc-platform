// Client-side navigation hints only. The canonical read queues and mutation
// handlers remain the authority for membership, assignment, rights and revision.
export type RetailInvoiceNavigationTarget = { siteId: string; invoiceId: string; invoiceNumber: string };
export type RetailInvoiceNavigationView = "approvals" | "issue" | "collections";
export type RetailInvoiceNavigationRow = {
  siteId: string;
  canApprove?: boolean;
  canIssue?: boolean;
  canCollect?: boolean;
  invoice: { id: string; number: string; status: string; outstandingAmount?: string };
};

export function retailInvoiceNavigationHref(view: RetailInvoiceNavigationView, target: RetailInvoiceNavigationTarget) {
  const params = new URLSearchParams({
    section: view === "collections" ? "collections" : "approvals",
    siteId: target.siteId, invoiceId: target.invoiceId, invoiceNumber: target.invoiceNumber,
    ...(view === "collections" ? {} : { invoiceView: view }),
  });
  return `/enterprise-modules/RETAIL_POS?${params}`;
}

export function matchesRetailInvoiceTarget(entry: RetailInvoiceNavigationRow, target: RetailInvoiceNavigationTarget) {
  return entry.siteId === target.siteId && entry.invoice.id === target.invoiceId && entry.invoice.number === target.invoiceNumber;
}

export function canNavigateRetailInvoice(view: RetailInvoiceNavigationView, entry: RetailInvoiceNavigationRow, checkoutReady = false) {
  if (view === "approvals") return entry.canApprove === true && entry.invoice.status === "PENDING_APPROVAL";
  if (view === "issue") return entry.canIssue === true && entry.invoice.status === "APPROVED";
  return checkoutReady && entry.canCollect === true && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(entry.invoice.status) && Number(entry.invoice.outstandingAmount) > 0;
}

/** Search the existing permissioned queue. Only a matching ID, number and
 * store from its current response can authorize a navigation hint. Never
 * derive eligibility from a displayed approver name or from a successful POST.
 * A bounded scan handles overlapping invoice numbers; fail closed on denial,
 * network error or an unusually broad search. No new endpoint/polling.
 */
export async function findRetailNavigationInvoice<T extends RetailInvoiceNavigationRow>(
  organizationId: string, view: RetailInvoiceNavigationView, target: RetailInvoiceNavigationTarget, signal?: AbortSignal,
): Promise<T | null> {
  if (!target.siteId || !target.invoiceId || !target.invoiceNumber || target.invoiceNumber.length > 100) return null;
  const endpoint = view === "collections" ? "invoices" : "invoices/workflow";
  try {
    for (let page = 1; page <= 5; page++) {
      if (signal?.aborted) return null;
      const query = new URLSearchParams({ view, siteId: target.siteId, q: target.invoiceNumber, page: String(page), pageSize: "100" });
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/${endpoint}?${query}`, { cache: "no-store", signal });
      if (!response.ok) return null;
      const body = await response.json() as { items?: T[]; checkoutReady?: boolean; pagination?: { pageCount?: number } };
      if (signal?.aborted || !Array.isArray(body.items)) return null;
      const match = body.items.find((entry) => matchesRetailInvoiceTarget(entry, target));
      if (match) return canNavigateRetailInvoice(view, match, body.checkoutReady) ? match : null;
      if (!(Number(body.pagination?.pageCount) > page)) break;
    }
  } catch { /* The UI must never grant an action on an unavailable read. */ }
  return null;
}
