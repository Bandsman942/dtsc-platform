"use client";

import { useEffect, useState } from "react";

export type EnterpriseBusinessContextPayload = {
  timezone: string;
  functionalCurrencyCode: string | null;
  businessDate: string;
};

export function useEnterpriseBusinessContext(organizationId: string) {
  const [context, setContext] = useState<EnterpriseBusinessContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/enterprise/${organizationId}/business-context`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (EnterpriseBusinessContextPayload & { error?: string; message?: string }) | null;
        if (!response.ok || !body?.businessDate) throw new Error(body?.message || body?.error || "ENTERPRISE_BUSINESS_CONTEXT_UNAVAILABLE");
        if (active) setContext(body);
      })
      .catch((loadError) => {
        if (!active) return;
        setContext(null);
        setError(loadError instanceof Error ? loadError.message : "ENTERPRISE_BUSINESS_CONTEXT_UNAVAILABLE");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId]);

  return { context, loading, error };
}
