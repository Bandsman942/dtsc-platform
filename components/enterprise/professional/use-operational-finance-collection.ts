"use client";

import { useEffect, useMemo, useState } from "react";
import { safeFinanceError } from "@/components/enterprise/professional/finance-professional-ui";
import type { FinanceRecord } from "@/components/enterprise/professional/finance-professional-workspace-shared";

type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };

export function useOperationalFinanceCollection<T extends FinanceRecord>({
  endpoint,
  page,
  search,
  status,
  filters,
  refreshKey,
}: {
  endpoint: string;
  page: number;
  search?: string;
  status?: string;
  filters?: Record<string, string | boolean | undefined>;
  refreshKey: number;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const filterKey = useMemo(() => JSON.stringify(filters || {}), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search?.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === false) return;
      params.set(key, String(value));
    });
    setLoading(true);
    setError("");
    fetch(`${endpoint}?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || "Finance list unavailable");
        setItems(Array.isArray(body.items) ? body.items : []);
        setPagination(body.pagination || EMPTY_PAGINATION);
        setMetrics(body.metrics || {});
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setItems([]);
        setPagination(EMPTY_PAGINATION);
        setMetrics({});
        setError(safeFinanceError(requestError, "Impossible de charger cette vue Finance."));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [endpoint, page, refreshKey, search, status, filterKey]);

  return { items, pagination, metrics, loading, error };
}

export async function fetchOperationalFinanceRecord<T extends FinanceRecord>(endpoint: string, recordId: string): Promise<T | null> {
  const params = new URLSearchParams({ page: "1", pageSize: "5", recordId });
  const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || "Finance record unavailable");
  return Array.isArray(body.items) ? (body.items[0] as T | undefined) || null : null;
}
