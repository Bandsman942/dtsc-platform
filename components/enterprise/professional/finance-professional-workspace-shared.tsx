"use client";

export * from "@/components/enterprise/professional/finance-professional-workspace-shared-legacy";

import { financeMutation as legacyFinanceMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared-legacy";

export const FINANCE_DURABLE_JOB_EVENT = "dtsc:finance-durable-job";

// Public bridge contract retained for historical Finance document deep links.
// The rendering implementation is delegated to the legacy module re-exported above.
export const FINANCE_DOCUMENT_UPLOAD_QUERY_CONTRACT = Object.freeze({
  sourceEntityType: "sourceEntityType",
  sourceEntityId: "sourceEntityId",
  action: "action=upload",
});

export async function financeMutation(endpoint: string, payload: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const body = await legacyFinanceMutation(endpoint, payload, method) as {
    queued?: boolean;
    mode?: string;
    job?: { id?: string; status?: string; statusUrl?: string; downloadUrl?: string | null };
    [key: string]: unknown;
  };
  if (body.queued && body.job?.id && body.job.statusUrl && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FINANCE_DURABLE_JOB_EVENT, {
      detail: {
        endpoint,
        mode: body.mode || "durable",
        job: body.job,
      },
    }));
  }
  return body;
}
