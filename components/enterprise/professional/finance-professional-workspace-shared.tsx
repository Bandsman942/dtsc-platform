"use client";

export * from "@/components/enterprise/professional/finance-professional-workspace-shared-legacy";

export const FINANCE_DURABLE_JOB_EVENT = "dtsc:finance-durable-job";

// Public bridge contract retained for historical Finance document deep links.
// The rendering implementation is delegated to the legacy module re-exported above.
export const FINANCE_DOCUMENT_UPLOAD_QUERY_CONTRACT = Object.freeze({
  sourceEntityType: "sourceEntityType",
  sourceEntityId: "sourceEntityId",
  action: "action=upload",
});

export class FinanceApiError extends Error {
  code: string;
  clientMessage: string | null;
  details: unknown;
  status: number;

  constructor(input: { code?: string; message?: string; details?: unknown; status: number }) {
    const code = input.code || "FINANCE_OPERATION_FAILED";
    super(code);
    this.name = "FinanceApiError";
    this.code = code;
    this.clientMessage = typeof input.message === "string" && input.message.trim() ? input.message.trim() : null;
    this.details = input.details;
    this.status = input.status;
  }
}

export async function financeMutation(endpoint: string, payload: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const response = await fetch(endpoint, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null) as {
    error?: string;
    message?: string;
    details?: unknown;
    queued?: boolean;
    mode?: string;
    job?: { id?: string; status?: string; statusUrl?: string; downloadUrl?: string | null };
    [key: string]: unknown;
  } | null;
  if (!response.ok) {
    throw new FinanceApiError({
      code: body?.error,
      message: body?.message,
      details: body?.details,
      status: response.status,
    });
  }
  if (body && body.queued && body.job?.id && body.job.statusUrl && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FINANCE_DURABLE_JOB_EVENT, {
      detail: {
        endpoint,
        mode: body.mode || "durable",
        job: body.job,
      },
    }));
  }
  return body || {};
}
