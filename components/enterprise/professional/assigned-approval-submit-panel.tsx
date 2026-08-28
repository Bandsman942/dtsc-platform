"use client";

import type { FormEvent } from "react";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { Button } from "@/components/ui/button";

export function AssignedApprovalSubmitPanel({
  organizationId,
  moduleCode,
  locale,
  title,
  description,
  submitting,
  onSubmit,
  onCancel,
}: {
  organizationId: string;
  moduleCode: string;
  locale?: string | null;
  title?: string;
  description?: string;
  submitting: boolean;
  onSubmit: (approverUserId: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const isEn = locale === "en";
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const approverUserId = String(data.get("approverUserId") || "").trim();
    if (!approverUserId) return;
    await onSubmit(approverUserId);
  }

  return <form onSubmit={handleSubmit} className="grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-4">
    <div className="min-w-0">
      <h3 className="font-black text-dtsc-ink">{title || (isEn ? "Assign approval" : "Affecter la validation")}</h3>
      <p className="mt-1 text-sm leading-6 text-dtsc-muted">{description || (isEn
        ? "Choose an authorized person before submitting. Eligibility is checked again by the server when the decision is made."
        : "Choisissez un responsable autorisé avant la soumission. Son éligibilité sera de nouveau vérifiée par le serveur au moment de la décision.")}</p>
    </div>
    <EnterpriseApproverSelect organizationId={organizationId} moduleCode={moduleCode} locale={locale} disabled={submitting} />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={submitting}>{submitting ? (isEn ? "Submitting…" : "Soumission…") : (isEn ? "Submit for approval" : "Soumettre pour validation")}</Button>
      <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>{isEn ? "Cancel" : "Annuler"}</Button>
    </div>
  </form>;
}
