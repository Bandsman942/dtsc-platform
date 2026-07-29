"use client";

import { useCallback, useEffect, useState } from "react";

export type ServerPagination = { page: number; pageSize: number; total: number; pageCount: number };

export function useEnterpriseV2Collection<T>({ endpoint, params, refreshKey = 0 }: { endpoint: string; params: URLSearchParams; refreshKey?: number }) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<ServerPagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const serializedParams = params.toString();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch(`${endpoint}?${serializedParams}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { items?: T[]; pagination?: ServerPagination; message?: string } | null;
    if (response.ok && body?.items && body.pagination) {
      setItems(body.items);
      setPagination(body.pagination);
    } else {
      setError(body?.message || "LOAD_FAILED");
    }
    setLoading(false);
  }, [endpoint, serializedParams]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  return { items, pagination, loading, error, reload: load };
}

export async function enterpriseV2Mutation(endpoint: string, method: "POST" | "PATCH", payload: unknown) {
  const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = (await response.json().catch(() => null)) as { message?: string; [key: string]: unknown } | null;
  if (!response.ok) throw new Error(body?.message || "ACTION_FAILED");
  return body;
}
