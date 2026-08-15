"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { ProfessionalReportView } from "@/components/reports/professional-report-view";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { buildFinancialStatementProfessionalReport } from "@/lib/reporting/finance-professional-report";

type StatementDetail = {
  id: string;
  statementType: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  status: string;
  snapshotJson: unknown;
  generatedAt: string;
  publishedAt?: string | null;
};

export function FinancialStatementReportDialog({
  organizationId,
  organizationName,
  organizationLogoUrl,
  statementId,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  statementId: string;
  locale?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const en = String(locale || "fr").toLowerCase().startsWith("en");

  const model = useMemo(() => statement ? buildFinancialStatementProfessionalReport({ statement, organizationName, locale }) : null, [locale, organizationName, statement]);

  async function showReport() {
    setOpen(true);
    if (statement) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/financial-statements/${statementId}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { statement?: StatementDetail; error?: string; message?: string } | null;
      if (!response.ok || !body?.statement) throw new Error(body?.message || body?.error || (en ? "Unable to load the financial statement." : "Chargement de l’état financier impossible."));
      setStatement(body.statement);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (en ? "Unable to load the financial statement." : "Chargement de l’état financier impossible."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" type="button" onClick={() => void showReport()}>
        <Eye className="h-4 w-4" />{en ? "View report" : "Voir le rapport"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={en ? "Financial statement" : "État financier"}
        description={en ? "Professional presentation generated from the authorized immutable snapshot." : "Présentation professionnelle générée à partir du snapshot autorisé et non modifiable."}
        className="h-[96dvh] max-w-6xl"
      >
        {loading ? <div className="grid min-h-64 place-items-center text-sm font-bold text-dtsc-muted">{en ? "Preparing report…" : "Préparation du rapport…"}</div> : null}
        {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm font-semibold text-dtsc-ink">{error}</div> : null}
        {model ? <ProfessionalReportView model={model} locale={locale} logoUrl={organizationLogoUrl} /> : null}
      </Dialog>
    </>
  );
}
