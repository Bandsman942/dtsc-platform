"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { CATALOG_IMPORT_COLUMNS } from "@/lib/enterprise/master-data/catalog-template";
import { downloadProfessionalCsv, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import { professionalErpT, type ProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";

type Preview = { count: number; valid: number; invalid: number; rows: Array<{ line: number; name: string; itemType: string; errors: string[] }> };

export function CatalogImportControls({ organizationId, organizationName, locale, canWrite, units, categories, onImported }: {
  organizationId: string;
  organizationName: string;
  locale: ProfessionalErpLocale;
  canWrite: boolean;
  units: Array<{ code: string; name: string }>;
  categories: Array<{ code: string; name: string }>;
  onImported: () => void;
}) {
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState("");
  const codes = t("catalog.importReference", {
    units: units.map(({ code }) => code).join(", ") || "—",
    categories: categories.map(({ code }) => code).join(", ") || "—",
  });

  function downloadTemplate(format: "CSV" | "Excel") {
    if (!units.length) { notifyToast(t("catalog.importNoUnits"), "warning"); return; }
    const model: ProfessionalReportExportModel = {
      title: t("catalog.importTitle"),
      subtitle: t("catalog.importHelp"),
      organizationName,
      filenameBase: `dtsc-catalogue-${organizationName}-modele`,
      kpis: [], chart: [],
      columns: CATALOG_IMPORT_COLUMNS.map((column) => ({ key: column.key, label: column[locale] })),
      // Blank editable rows avoid accidentally importing demonstration products.
      rows: Array.from({ length: 3 }, () => Object.fromEntries(CATALOG_IMPORT_COLUMNS.map(({ key }) => [key, ""]))),
      insights: [
        { title: t("catalog.unit"), body: units.map(({ code, name }) => `${code} : ${name}`).join(" · ") },
        { title: t("catalog.category"), body: categories.map(({ code, name }) => `${code} : ${name}`).join(" · ") || "—" },
        { title: t("catalog.importHelp"), body: codes },
      ],
    };
    if (format === "CSV") downloadProfessionalCsv(model);
    else downloadProfessionalXlsx(model);
    notifyToast(t("catalog.templateReady", { format, organization: organizationName }), "success");
  }

  async function submit(mode: "preview" | "commit") {
    if (busy) return;
    if (!file) { const text = t("catalog.importFileRequired"); setError(text); notifyToast(text, "warning"); return; }
    setError(""); setBusy(mode);
    const form = new FormData();
    form.set("mode", mode);
    form.set("file", file);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/catalog/import`, {
        method: "POST", body: form, headers: { "Accept-Language": locale },
      });
      const body = await response.json().catch(() => null) as { preview?: Preview; imported?: number; message?: string; error?: string } | null;
      if (body?.preview) setPreview(body.preview);
      if (!response.ok || !body) throw new Error(body?.message || t("common.createFailed"));
      if (mode === "preview") {
        if (body.preview?.invalid) notifyToast(t("catalog.importValid", { valid: body.preview.valid, total: body.preview.count, invalid: body.preview.invalid }), "warning");
        else notifyToast(t("catalog.importReady", { count: body.preview?.valid ?? 0 }), "success");
      } else {
        const count = body.imported ?? 0;
        notifyToast(t("catalog.importDone", { count, organization: organizationName }), "success");
        setFile(null); setPreview(null); setOpen(false); onImported();
      }
    } catch (reason) {
      const text = t("catalog.importError", { message: reason instanceof Error ? reason.message : t("common.createFailed") });
      setError(text); notifyToast(text, "error");
    } finally { setBusy(null); }
  }

  if (!canWrite) return null;
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => downloadTemplate("CSV")}><Download className="h-4 w-4" />{t("catalog.templateCsv")}</Button>
      <Button variant="outline" onClick={() => downloadTemplate("Excel")}><FileSpreadsheet className="h-4 w-4" />{t("catalog.templateXlsx")}</Button>
      <Button onClick={() => { setError(""); setPreview(null); setOpen(true); }}><UploadCloud className="h-4 w-4" />{t("catalog.importButton")}</Button>
    </div>
    <Dialog open={open} title={t("catalog.importTitle")} description={t("catalog.importHelp")} onClose={() => { if (!busy) setOpen(false); }} className="h-[92dvh] max-w-3xl">
      <div className="grid gap-4 p-1">
        <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-muted">{codes}</div>
        <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
          {t("catalog.chooseFile")}
          <Input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy)} onChange={(event) => {
            setFile(event.target.files?.[0] || null); setPreview(null); setError("");
          }} />
        </label>
        {error ? <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}
        {preview ? <div className="grid gap-3 rounded-xl border border-dtsc-border p-3">
          <p className="font-semibold text-dtsc-ink">{t("catalog.importValid", { valid: preview.valid, total: preview.count, invalid: preview.invalid })}</p>
          {preview.rows.filter((row) => row.errors.length).length ? <div className="max-h-60 space-y-2 overflow-y-auto" aria-live="polite">{preview.rows.filter((row) => row.errors.length).map((row) => <div key={row.line} className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"><strong>{t("catalog.importRow", { line: row.line, name: row.name || "—" })}</strong><ul className="list-disc pl-5">{row.errors.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div> : null}
        </div> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="outline" disabled={Boolean(busy) || !file} onClick={() => void submit("preview")}>{busy === "preview" ? t("catalog.importChecking") : t("catalog.previewImport")}</Button>
          <Button disabled={Boolean(busy) || !preview || preview.invalid !== 0 || preview.count === 0} onClick={() => void submit("commit")}>{busy === "commit" ? t("catalog.importWorking") : t("catalog.importConfirm", { count: preview?.valid ?? 0 })}</Button>
        </div>
      </div>
    </Dialog>
  </>;
}
