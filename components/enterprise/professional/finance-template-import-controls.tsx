"use client";

import { useState, type ChangeEvent } from "react";
import { FileDown, FileUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { FINANCE_IMPORT_COLUMNS } from "@/lib/enterprise/accounting/finance-template-columns";
import { downloadProfessionalCsv, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

type Kind = keyof typeof FINANCE_IMPORT_COLUMNS;
type Preview = { count: number; valid: number; invalid: number; rows: Array<{ line: number; code: string; description: string; errors: string[] }> };

/** Controlled, preflighted imports for mutable tax references and custom child accounts only. */
export function FinanceTemplateImportControls({ kind, organizationId, organizationName, locale, onImported, canImport }: {
  kind: Kind; organizationId: string; organizationName: string; locale: "fr" | "en"; onImported: () => void; canImport: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const en = locale === "en";
  const tr = (fr: string, english: string) => en ? english : fr;
  const title = kind === "tax" ? tr("Codes de taxes", "Tax codes") : tr("Sous-comptes personnalisés", "Custom child accounts");
  const columns = FINANCE_IMPORT_COLUMNS[kind];
  function download(format: "CSV" | "Excel") {
    const model: ProfessionalReportExportModel = {
      title: tr(`Modèle · ${title}`, `Template · ${title}`), organizationName,
      filenameBase: `DTSC-modele-${kind}`, generatedLabel: tr("Modèle vierge à remplir", "Blank template"),
      columns: columns.map((column) => ({ key: column.key, label: en ? column.en : column.fr })),
      rows: [], chart: [], kpis: [], insights: [], accentHex: "#087EA4",
    };
    if (format === "CSV") downloadProfessionalCsv(model);
    else downloadProfessionalXlsx(model);
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    setPreview(null);
    const selected = event.target.files?.[0] || null;
    if (selected && (!/\.(csv|xlsx)$/i.test(selected.name) || selected.size > 2 * 1024 * 1024)) {
      setFile(null); notifyToast(tr("Le fichier doit être un CSV ou un XLSX de 2 Mo maximum.", "Upload a CSV or XLSX file up to 2 MB."), "error");
    } else setFile(selected);
  }
  async function submit(mode: "preview" | "commit") {
    if (!file || busy) return;
    setBusy(mode);
    try {
      const payload = new FormData();
      payload.set("kind", kind); payload.set("mode", mode); payload.set("file", file);
      const response = await fetch(`/api/enterprise/${organizationId}/finance-template-import?kind=${kind}`, { method: "POST", body: payload, headers: { "accept-language": locale } });
      const result = await response.json().catch(() => null) as { preview?: Preview; imported?: number; message?: string } | null;
      if (result?.preview) setPreview(result.preview);
      if (!response.ok) throw new Error(result?.message || tr("Vérification du modèle impossible.", "Unable to validate the template."));
      if (mode === "preview") notifyToast(tr(`${result?.preview?.valid || 0} lignes valides sur ${result?.preview?.count || 0}.`, `${result?.preview?.valid || 0} valid rows out of ${result?.preview?.count || 0}.`), result?.preview?.invalid ? "warning" : "success");
      else {
        notifyToast(tr(`${result?.imported || 0} référentiels « ${title} » importés.`, `${result?.imported || 0} “${title}” records imported.`), "success");
        setPreview(null); setFile(null); onImported();
      }
    } catch (error) { notifyToast(error instanceof Error ? error.message : tr("Import impossible.", "Import failed."), "error"); }
    finally { setBusy(null); }
  }
  return <section className="grid gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-3 sm:p-4" aria-label={tr(`Import groupé : ${title}`, `Bulk import: ${title}`)}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-dtsc-ink">{tr("Importer un modèle de référentiel", "Import a reference template")} · {title}</h3><p className="mt-1 text-xs text-dtsc-muted">{tr("Téléchargez le modèle, complétez jusqu’à 100 lignes et prévisualisez les erreurs avant tout enregistrement.", "Download the template, fill in up to 100 rows, and preview errors before saving anything.")}</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => download("Excel")}><FileDown className="mr-1 h-4 w-4" />Excel</Button><Button type="button" size="sm" variant="outline" onClick={() => download("CSV")}><FileDown className="mr-1 h-4 w-4" />CSV</Button></div></div>
    {kind === "accounts" ? <p className="text-xs text-amber-700 dark:text-amber-300"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />{tr("Conservez le code du plan et du compte parent. Les comptes proposés par DTSC restent intacts ; seuls de nouveaux sous-comptes sont créés.", "Use the chart and parent codes. DTSC system accounts remain unchanged; only custom child accounts are created.")}</p> : null}
    <div className="flex flex-wrap items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted"><span>{tr("Modèle rempli (obligatoire)", "Completed template (required)")}</span><Input type="file" accept=".csv,.xlsx" disabled={!canImport || Boolean(busy)} onChange={choose} className="h-10 w-full" aria-label={tr("Choisir le modèle rempli", "Choose the completed template")} /></label><Button type="button" variant="outline" disabled={!canImport || !file || Boolean(busy)} onClick={() => void submit("preview")}>{busy === "preview" ? "…" : tr("Prévisualiser", "Preview")}</Button><Button type="button" disabled={!canImport || !file || !preview || preview.invalid > 0 || preview.valid === 0 || Boolean(busy)} onClick={() => void submit("commit")}><FileUp className="mr-1 h-4 w-4" />{busy === "commit" ? "…" : tr("Importer les lignes valides", "Import validated rows")}</Button></div>
    {preview ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"><strong className="text-dtsc-ink">{tr("Prévisualisation", "Preview")}: {preview.valid}/{preview.count}</strong>{preview.invalid ? <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-rose-700 dark:text-rose-300">{preview.rows.filter((row) => row.errors.length).map((row) => <li key={row.line}>{tr("Ligne", "Row")} {row.line} ({row.code || "—"}) : {row.errors.join(" · ")}</li>)}</ul> : <span className="ml-2 text-emerald-700 dark:text-emerald-300">{tr("Toutes les lignes sont valides.", "All rows are valid.")}</span>}</div> : null}
  </section>;
}
