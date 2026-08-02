"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, CircleHelp, LifeBuoy, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ProfessionalPagination = { page: number; pageSize: number; total: number; pageCount: number };

export function useProfessionalCollection<T, TExtra extends Record<string, unknown> = Record<string, never>>({
  endpoint,
  params,
  refreshKey = 0,
}: {
  endpoint: string;
  params: URLSearchParams;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<ProfessionalPagination>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<TExtra>({} as TExtra);
  const [canManage, setCanManage] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const serializedParams = params.toString();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}?${serializedParams}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as (TExtra & { items?: T[]; pagination?: ProfessionalPagination; metrics?: Record<string, number>; canManage?: boolean; canWrite?: boolean; message?: string; error?: string }) | null;
      if (!response.ok || !body?.items || !body.pagination) throw new Error(body?.message || body?.error || "Chargement impossible.");
      setItems(body.items);
      setPagination(body.pagination);
      setMetrics(body.metrics || {});
      setCanManage(Boolean(body.canManage));
      setCanWrite(Boolean(body.canWrite ?? body.canManage));
      const rest = Object.fromEntries(
        Object.entries(body).filter(([key]) => !["items", "pagination", "metrics", "canManage", "canWrite"].includes(key)),
      );
      setExtra(rest as TExtra);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, serializedParams]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  return { items, pagination, metrics, extra, canManage, canWrite, loading, error, reload: load };
}

export async function professionalMutation(endpoint: string, payload: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const response = await fetch(endpoint, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null) as { message?: string; error?: string; [key: string]: unknown } | null;
  if (!response.ok) throw new Error(body?.message || body?.error || "L’action n’a pas pu être terminée.");
  return body || {};
}

export function ProfessionalTabs<T extends string>({
  value,
  onChange,
  items,
  label = "Navigation du module",
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ id: T; label: string; count?: number }>;
  label?: string;
}) {
  const railRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>("[data-professional-tab-active='true']");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [value]);

  return (
    <nav
      ref={railRef}
      aria-label={label}
      data-professional-tabs
      data-horizontal-rail
      className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-professional-tab-active={value === item.id ? "true" : undefined}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "min-h-10 shrink-0 snap-center whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-black transition",
            value === item.id ? "border-dtsc-blue bg-dtsc-blue text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:bg-dtsc-soft",
          )}
        >
          {item.label}{item.count !== undefined ? ` · ${item.count}` : ""}
        </button>
      ))}
    </nav>
  );
}

export function ProfessionalSearch({ value, onChange, placeholder = "Rechercher…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-11 rounded-xl pl-9" />
    </div>
  );
}

export function ProfessionalFormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-dtsc-border pt-5 first:border-t-0 first:pt-0">
      <legend className="px-0 text-base font-black text-dtsc-ink">{title}</legend>
      {description ? <p className="mt-1 text-sm leading-6 text-dtsc-muted">{description}</p> : null}
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ProfessionalHelp({ moduleCode }: { moduleCode: string }) {
  return (
    <div className="grid gap-3 border-y border-dtsc-border py-4 text-sm text-dtsc-muted sm:grid-cols-3">
      <Link href={`/help/enterprise?module=${encodeURIComponent(moduleCode)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-black text-dtsc-blue hover:bg-dtsc-soft"><BookOpen className="h-4 w-4" />Guide utilisateur</Link>
      <Link href="/support" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-black text-dtsc-blue hover:bg-dtsc-soft"><LifeBuoy className="h-4 w-4" />Contacter le support</Link>
      <Link href="/enterprise-admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-black text-dtsc-blue hover:bg-dtsc-soft"><CircleHelp className="h-4 w-4" />Permissions et configuration</Link>
    </div>
  );
}

export function ProfessionalError({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-300">{message}</div>;
}

export function ProfessionalLoading({ rows = 4 }: { rows?: number }) {
  return <div className="grid gap-3">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-dtsc-soft" />)}</div>;
}
