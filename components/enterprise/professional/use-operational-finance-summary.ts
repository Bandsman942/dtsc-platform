"use client";

import { useEffect, useState } from "react";
import { safeFinanceError } from "@/components/enterprise/professional/finance-professional-ui";

export type OperationalFinanceSummary = {
  moduleCode: string;
  openCount?: number;
  overdueCount?: number;
  pendingApprovalCount?: number;
  pendingReviewCount?: number;
  pendingDecisionCount?: number;
  totalCount?: number;
  inboundCount?: number;
  outboundCount?: number;
  unallocatedCount?: number;
  ageing?: Record<"TO_DUE" | "D1_30" | "D31_60" | "D61_90" | "D90_PLUS", number>;
};

export function useOperationalFinanceSummary(organizationId: string, moduleCode: string, refreshKey: number) {
  const [summary, setSummary] = useState<OperationalFinanceSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(`/api/enterprise/${organizationId}/finance/operational-summary?module=${encodeURIComponent(moduleCode)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || "Finance summary unavailable");
        setSummary(body.summary || null);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(safeFinanceError(requestError, "Impossible de charger les indicateurs Finance."));
      });
    return () => controller.abort();
  }, [organizationId, moduleCode, refreshKey]);
  return { summary, error };
}
