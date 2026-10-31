"use client";

import { useEffect, useMemo, useState } from "react";
import { safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { FinanceApiError, type FinanceRecord } from "@/components/enterprise/professional/finance-professional-workspace-shared";

type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };

type FinanceReadPayload = {
  error?: string;
  message?: string;
  details?: unknown;
  items?: unknown;
  pagination?: Pagination;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Keep HTTP status/business reason for safe, localized presentation at the call site. */
export async function fetchOperationalFinanceJson(endpoint: string, options: { signal?: AbortSignal } = {}): Promise<FinanceReadPayload> {
  let response: Response;
  try {
    response = await fetch(endpoint, { cache: "no-store", ...options });
  } catch (requestError) {
    if (options.signal?.aborted) throw requestError;
    throw new FinanceApiError({ code: "FINANCE_NETWORK_UNAVAILABLE", status: 0 });
  }
  const body = await response.json().catch(() => null) as FinanceReadPayload | null;
  if (!response.ok) {
    throw new FinanceApiError({
      code: typeof body?.error === "string" ? body.error : "FINANCE_COLLECTION_READ_FAILED",
      // Read failures have no user-entered field to explain; never surface arbitrary
      // server message text, SQL/stack fragments, or cross-tenant identifiers.
      details: body?.details,
      status: response.status,
    });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FinanceApiError({ code: "FINANCE_RESPONSE_INVALID", status: response.status });
  }
  return body;
}

export function useOperationalFinanceCollection<T extends FinanceRecord>({
  endpoint,
  page,
  search,
  status,
  filters,
  refreshKey,
  locale = "fr",
}: {
  endpoint: string;
  page: number;
  search?: string;
  status?: string;
  filters?: Record<string, string | boolean | undefined>;
  refreshKey: number;
  locale?: FinanceLocale;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search?.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === false) return;
      params.set(key, String(value));
    });
    return params.toString();
  }, [filters, page, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchOperationalFinanceJson(`${endpoint}?${query}`, { signal: controller.signal })
      .then((body) => {
        if (controller.signal.aborted) return;
        setItems(Array.isArray(body.items) ? body.items : []);
        setPagination(body.pagination || EMPTY_PAGINATION);
        setMetrics(body.metrics || {});
      })
      .catch((requestError) => {
        if (controller.signal.aborted || (requestError instanceof Error && requestError.name === "AbortError")) return;
        setItems([]);
        setPagination(EMPTY_PAGINATION);
        setMetrics({});
        setError(safeFinanceError(requestError, locale === "en" ? "This finance view could not be loaded." : "Impossible de charger cette vue Finance.", locale));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, query, refreshKey, locale]);

  return { items, pagination, metrics, loading, error };
}

export async function fetchOperationalFinanceRecord<T extends FinanceRecord>(endpoint: string, recordId: string): Promise<T | null> {
  const params = new URLSearchParams({ page: "1", pageSize: "5", recordId });
  const body = await fetchOperationalFinanceJson(`${endpoint}?${params.toString()}`);
  return Array.isArray(body.items) ? (body.items[0] as T | undefined) || null : null;
}
