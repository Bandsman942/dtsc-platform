"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MonetaryScopes } from "@/lib/enterprise/common/analytics";

export type ServerPagination = { page: number; pageSize: number; total: number; pageCount: number };
export type ServerCollectionMeta = Partial<MonetaryScopes> & { canManage?: boolean; canCreate?: boolean; currentUserId?: string; metrics?: Record<string, number>; latestGeneratedAt?: string | null };

export function useEnterpriseV2Collection<T>({ endpoint, params, refreshKey = 0 }: { endpoint: string; params: URLSearchParams; refreshKey?: number }) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<ServerPagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [meta, setMeta] = useState<ServerCollectionMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const serializedParams = params.toString();

  const requestRevision = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}?${serializedParams}`, { cache: "no-store", signal: controller.signal });
      const body = (await response.json().catch(() => null)) as ({ items?: T[]; pagination?: ServerPagination; message?: string; metrics?: Record<string, number> } & ServerCollectionMeta) | null;
      if (revision !== requestRevision.current) return;
      if (response.ok && body?.items && body.pagination) {
        setItems(body.items);
        setPagination(body.pagination);
        setMeta({ canManage: body.canManage, canCreate: body.canCreate, currentUserId: body.currentUserId, metrics: body.metrics, latestGeneratedAt: body.latestGeneratedAt, filteredTotals: body.filteredTotals, generalTotals: body.generalTotals, pageTotals: body.pageTotals });
      } else {
        setError(body?.message || "LOAD_FAILED");
      }
    } catch {
      if (revision === requestRevision.current && !controller.signal.aborted) setError("LOAD_FAILED");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [endpoint, serializedParams]);

  const cancel = useCallback(() => { requestRevision.current++; pendingRequest.current?.abort(); }, []);
  useEffect(() => { void load(); return cancel; }, [load, refreshKey, cancel]);
  return { items, pagination, meta, loading, error, reload: load };
}

export async function enterpriseV2Mutation(endpoint: string, method: "POST" | "PATCH", payload: unknown) {
  const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = (await response.json().catch(() => null)) as { message?: string; [key: string]: unknown } | null;
  if (!response.ok) throw new Error(body?.message || "ACTION_FAILED");
  return body;
}