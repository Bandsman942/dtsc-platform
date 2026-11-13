"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { professionalErpT, type ProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";

type PreviewRow = {
  line: number;
  name: string;
  itemType: string;
  sku: string;
  description: string;
  categoryCode: string;
  unitCode: string;
  salePrice: string;
  cost: string;
  currency: string;
  taxable: string;
  taxCode: string;
  trackInventory: string;
  errors: string[];
};
type Preview = { count: number; valid: number; invalid: number; rows: PreviewRow[] };
type PreviewFilter = "all" | "valid" | "invalid";
const PAGE_SIZE = 20;

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
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState("");
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [previewSearch, setPreviewSearch] = useState("");
  const [page, setPage] = useState(1);
  const codes = t("catalog.importReference", {
    units: units.map(({ code }) => code).join(", ") || "—",
    categories: categories.map(({ code }) => code).join(", ") || "—",
  });
  const filtered = useMemo(() => {
    const search = previewSearch.trim().toLocaleLowerCase(locale);
    return (preview?.rows || []).filter((row) =>
      (previewFilter === "all" || (previewFilter === "valid" ? !row.errors.length : row.errors.length > 0)) &&
      (!search || [row.name, row.sku, row.categoryCode, row.unitCode, String(row.line)].some((value) => value.toLocaleLowerCase(locale).includes(search)))
    );
  }, [preview, previewFilter, previewSearch, locale]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function clearPreview() {
    setPreview(null); setPreviewFilter("all"); setPreviewSearch(""); setPage(1);
  }

  async function downloadTemplate(format: "csv" | "xlsx") {
    if (downloading) return;
    if (!units.length) { notifyToast(t("catalog.importNoUnits"), "warning"); return; }
    setDownloading(format);
    try {
      const response = await fetch("/api/enterprise/" + organizationId + "/catalog/import?format=" + format, {
        headers: { "Accept-Language": locale }, cache: "no-store",
      });
      if (!response.ok) {
        const details = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(details?.message || t("catalog.templateFailed"));
      }
      const content = await response.blob();
      const url = URL.createObjectURL(content);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "dtsc-catalogue-" + organizationName.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 55) + "-modele." + format;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notifyToast(t("catalog.templateReady", { format: format.toUpperCase(), organization: organizationName }), "success");
    } catch (reason) {
      notifyToast(reason instanceof Error ? reason.message : t("catalog.templateFailed"), "error");
    } finally { setDownloading(null); }
  }

  async function submit(mode: "preview" | "commit") {
    if (busy) return;
    if (!file) { const text = t("catalog.importFileRequired"); setError(text); notifyToast(text, "warning"); return; }
    setError(""); setBusy(mode);
    const form = new FormData();
    form.set("mode", mode);
    form.set("file", file);
    try {
      const response = await fetch("/api/enterprise/" + organizationId + "/catalog/import", {
        method: "POST", body: form, headers: { "Accept-Language": locale },
      });
      const body = await response.json().catch(() => null) as { preview?: Preview; imported?: number; message?: string; error?: string } | null;
      if (body?.preview) { setPreview(body.preview); setPage(1); }
      if (!response.ok || !body) throw new Error(body?.message || t("common.createFailed"));
      if (mode === "preview") {
        if (body.preview?.invalid) notifyToast(t("catalog.importValid", { valid: body.preview.valid, total: body.preview.count, invalid: body.preview.invalid }), "warning");
        else notifyToast(t("catalog.importReady", { count: body.preview?.valid ?? 0 }), "success");
      } else {
        const count = body.imported ?? 0;
        notifyToast(t("catalog.importDone", { count, organization: organizationName }), "success");
        setFile(null); clearPreview(); setOpen(false); onImported();
      }
    } catch (reason) {
      const text = t("catalog.importError", { message: reason instanceof Error ? reason.message : t("common.createFailed") });
      setError(text); notifyToast(text, "error");
    } finally { setBusy(null); }
  }

  if (!canWrite) return null;
  return <>
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-responsive-actions>
      <Button variant="outline" disabled={Boolean(downloading)} onClick={() => void downloadTemplate("csv")}><Download className="h-4 w-4" />{t("catalog.templateCsv")}</Button>
      <Button variant="outline" disabled={Boolean(downloading)} onClick={() => void downloadTemplate("xlsx")}><FileSpreadsheet className="h-4 w-4" />{t("catalog.templateXlsx")}</Button>
      <Button onClick={() => { setError(""); clearPreview(); setOpen(true); }}><UploadCloud className="h-4 w-4" />{t("catalog.importButton")}</Button>
    </div>
    <Dialog open={open} title={t("catalog.importTitle")} description={t("catalog.importHelp")} onClose={() => { if (!busy) setOpen(false); }} className="h-[92dvh] max-w-6xl">
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 p-1">
        <div className="min-w-0 break-words rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-muted">{codes}</div>
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-dtsc-ink">
          {t("catalog.chooseFile")}
          <Input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy)} onChange={(event) => {
            setFile(event.target.files?.[0] || null); clearPreview(); setError("");
          }} />
        </label>
        {error ? <p role="alert" className="min-w-0 break-words rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}
        {preview ? <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-dtsc-border p-3" aria-label={t("catalog.previewTitle")}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-dtsc-ink">{t("catalog.previewTitle")}</h3>
            <div className="flex min-w-0 flex-wrap gap-2 text-xs font-semibold" aria-live="polite">
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-700 dark:text-emerald-300">{t("catalog.previewValidCount", { count: preview.valid })}</span>
              <span className="rounded-full bg-red-500/15 px-3 py-1 text-red-700 dark:text-red-300">{t("catalog.previewInvalidCount", { count: preview.invalid })}</span>
              <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-700 dark:text-sky-300">{t("catalog.previewTotalCount", { count: preview.count })}</span>
            </div>
          </div>
          {preview.invalid ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">{t("catalog.previewBlocking")}</p> : <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-200">{t("catalog.previewClean")}</p>}
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-dtsc-muted">
              {t("catalog.previewSearch")}
              <Input value={previewSearch} onChange={(event) => { setPreviewSearch(event.target.value); setPage(1); }} placeholder={t("catalog.previewSearchHint")} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-dtsc-muted">
              {t("catalog.previewFilter")}
              <select className="h-10 min-w-32 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" value={previewFilter} onChange={(event) => { setPreviewFilter(event.target.value as PreviewFilter); setPage(1); }}>
                <option value="all">{t("catalog.previewAll")}</option>
                <option value="valid">{t("catalog.previewValid")}</option>
                <option value="invalid">{t("catalog.previewInvalid")}</option>
              </select>
            </label>
          </div>
          <div className="grid max-h-[42dvh] min-w-0 grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto" aria-live="polite">
            {visibleRows.map((row) => <div key={row.line} className={"min-w-0 rounded-xl border p-3 text-sm lg:hidden " + (row.errors.length ? "border-red-400/40 bg-red-500/5" : "border-emerald-400/30 bg-emerald-500/5")}>
              <div className="flex min-w-0 items-start justify-between gap-2">
                <strong className="min-w-0 break-words text-dtsc-ink">{t("catalog.importRow", { line: row.line, name: row.name || "—" })}</strong>
                <span className={row.errors.length ? "text-red-600 dark:text-red-300" : "text-emerald-600 dark:text-emerald-300"}>{row.errors.length ? t("catalog.previewInvalid") : t("catalog.previewValid")}</span>
              </div>
              <div className="mt-1 break-words text-xs text-dtsc-muted">{row.itemType === "PRODUCT" ? t("catalog.products") : t("catalog.services")} · {row.sku || "—"} · {row.categoryCode || "—"} · {row.unitCode || "—"}<br />{t("catalog.salePrice")}: {row.salePrice || "—"} {row.currency} · {t("catalog.purchaseCost")}: {row.cost || "—"}<br />{t("catalog.taxable")}: {row.taxable || "—"} · {t("catalog.taxCode")}: {row.taxCode || "—"} · {t("catalog.trackInventory")}: {row.trackInventory || "—"}{row.description ? <p className="mt-2 break-words">{row.description}</p> : null}</div>
              {row.errors.length ? <ul className="mt-2 list-disc pl-5 text-xs text-red-700 dark:text-red-300">{row.errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : null}
            </div>)}
            <div className="hidden min-w-0 overflow-x-auto lg:block" role="region" tabIndex={0} aria-label={t("catalog.previewTable")}>
              <table className="w-full min-w-[1250px] border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-dtsc-surface text-dtsc-muted"><tr>
                  {[t("catalog.previewLine"), t("catalog.name"), t("catalog.type"), t("catalog.sku"), t("catalog.description"), t("catalog.category"), t("catalog.unit"), t("catalog.salePrice"), t("catalog.purchaseCost"), t("catalog.currency"), t("catalog.taxable"), t("catalog.taxCode"), t("catalog.trackInventory"), t("catalog.previewStatus")].map((heading) => <th key={heading} scope="col" className="border-b border-dtsc-border p-2 font-semibold">{heading}</th>)}
                </tr></thead>
                <tbody>{visibleRows.map((row) => <tr key={row.line} className={row.errors.length ? "bg-red-500/5" : "bg-emerald-500/5"}>
                  <td className="border-b border-dtsc-border p-2">{row.line}</td>
                  <td className="max-w-52 break-words border-b border-dtsc-border p-2 font-semibold">{row.name || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.itemType === "PRODUCT" ? t("catalog.products") : t("catalog.services")}</td>
                  <td className="max-w-36 break-all border-b border-dtsc-border p-2">{row.sku || "—"}</td>
                  <td className="max-w-52 break-words border-b border-dtsc-border p-2">{row.description || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.categoryCode || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.unitCode || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.salePrice || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.cost || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.currency || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.taxable || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.taxCode || "—"}</td>
                  <td className="border-b border-dtsc-border p-2">{row.trackInventory || "—"}</td>
                  <td className="border-b border-dtsc-border p-2"><span className={row.errors.length ? "font-semibold text-red-600 dark:text-red-300" : "font-semibold text-emerald-600 dark:text-emerald-300"}>{row.errors.length ? t("catalog.previewInvalid") : t("catalog.previewValid")}</span>{row.errors.length ? <ul className="mt-1 list-disc space-y-1 pl-4 text-red-700 dark:text-red-300">{row.errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : null}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {!visibleRows.length ? <p className="p-3 text-sm text-dtsc-muted">{t("catalog.previewEmpty")}</p> : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted">
            <span>{t("catalog.previewShowing", { count: filtered.length, total: preview.count })}</span>
            <div className="flex flex-wrap items-center gap-2" data-responsive-actions>
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("catalog.previewPrevious")}</Button>
              <span>{t("catalog.previewPage", { page: currentPage, total: totalPages })}</span>
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>{t("catalog.previewNext")}</Button>
            </div>
          </div>
        </section> : null}
        <div className="flex min-w-0 flex-wrap justify-end gap-2" data-responsive-actions>
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="outline" disabled={Boolean(busy) || !file} onClick={() => void submit("preview")}>{busy === "preview" ? t("catalog.importChecking") : t("catalog.previewImport")}</Button>
          <Button disabled={Boolean(busy) || !preview || preview.invalid !== 0 || preview.count === 0} onClick={() => void submit("commit")}>{busy === "commit" ? t("catalog.importWorking") : t("catalog.importConfirm", { count: preview?.valid ?? 0 })}</Button>
        </div>
      </div>
    </Dialog>
  </>;
}
