"use client";

import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import type { FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";

type Template = {
  code: string; version: string; jurisdiction: string; category: string; rate: string;
  nameFr: string; nameEn: string; guidanceFr: string; guidanceEn: string;
  sourceAuthority: string; sourceUrl: string; verifiedAt: string;
};
type CatalogPayload = {
  countryCode: string | null;
  templates: Template[];
  adopted: { sourceTemplateCode: string | null; sourceTemplateVersion: string | null; isActive: boolean }[];
};

export function TaxCatalogPanel({ organizationId, locale, canCreate, onAdopted }: {
  organizationId: string; locale: FinanceLocale; canCreate: boolean; onAdopted: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [automate, setAutomate] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useToastMessage(error, "error");
  useToastMessage(success, "success");
  const endpoint = `/api/enterprise/${organizationId}/taxes/catalog`;

  async function reload(signal?: AbortSignal) {
    const response = await fetch(endpoint, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load tax catalog");
    return response.json() as Promise<CatalogPayload>;
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void reload(controller.signal).then((data) => setCatalog(data)).catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(locale === "en" ? "Tax templates are temporarily unavailable." : "Le catalogue fiscal est momentanément indisponible.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // The catalog is reloaded on organization and locale switch.
  }, [endpoint, locale]);

  async function adopt(template: Template) {
    if (busy) return;
    setBusy(template.code); setError(""); setSuccess("");
    try {
      await financeMutation(endpoint, { code: template.code, version: template.version, applyAutomatically: automate });
      setSuccess(locale === "en" ? "Tax template added to your company." : "Le modèle fiscal a été ajouté à votre entreprise.");
      setCatalog(await reload()); onAdopted();
    } catch {
      setError(locale === "en" ? "Unable to add this tax. Check permissions, jurisdiction and duplicates." : "Impossible d'ajouter cette taxe. Vérifiez la juridiction, les droits et les doublons.");
    } finally { setBusy(null); }
  }

  return <section aria-label={locale === "en" ? "DTSC tax catalog" : "Catalogue fiscal DTSC"} className="min-w-0 max-w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <BookOpen className="h-5 w-5 text-sky-400" aria-hidden="true" />
      <h2 className="text-base font-black">{locale === "en" ? "DTSC verified tax templates" : "Modèles fiscaux vérifiés par DTSC"}</h2>
      <span className="text-xs text-dtsc-muted">{catalog?.countryCode || ""}</span>
    </div>
    {loading ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "Loading templates…" : "Chargement des modèles…"}</p> :
      !catalog?.countryCode ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "Set your company's tax country in Company administration first." : "Configurez d'abord le pays fiscal dans l'administration de l'entreprise."}</p> :
      catalog.templates.length === 0 ? <p className="text-sm text-dtsc-muted">{locale === "en" ? "No approved template for this country yet. You can configure a tax manually." : "Aucun modèle validé pour ce pays pour le moment. Vous pouvez créer une taxe manuellement."}</p> :
      <div className="space-y-3">{catalog.templates.map((template) => {
        const adopted = catalog.adopted.some((item) => item.sourceTemplateCode === template.code);
        return <div key={`${template.code}@${template.version}`} className="min-w-0 rounded-xl border border-dtsc-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-dtsc-ink">{locale === "en" ? template.nameEn : template.nameFr}</p>
              <p className="text-xs text-dtsc-muted">{template.sourceAuthority} · {template.verifiedAt} · v{template.version}</p>
            </div>
            <span className="rounded-lg bg-dtsc-soft px-2 py-1 text-sm font-black">{(Number(template.rate) * 100).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")} %</span>
          </div>
          <p className="mt-2 text-sm text-dtsc-muted">{locale === "en" ? template.guidanceEn : template.guidanceFr}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3" data-responsive-actions>
            <a href={template.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-sky-400 underline underline-offset-4">{locale === "en" ? "Official source" : "Source officielle"}</a>
            {adopted ? <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-400"><CheckCircle2 className="h-4 w-4" />{locale === "en" ? "Already configured" : "Déjà configurée"}</span> :
              canCreate ? <Button type="button" size="sm" disabled={busy !== null} onClick={() => void adopt(template)}>
                {busy === template.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {locale === "en" ? "Add to my company" : "Ajouter à mon entreprise"}
              </Button> : null}
          </div>
        </div>;
      })}</div>}
    {canCreate && catalog?.templates.length ? <label className="mt-3 flex min-w-0 items-start gap-2 text-sm text-dtsc-muted">
      <input className="mt-1" type="checkbox" checked={automate} onChange={(e) => setAutomate(e.target.checked)} />
      <span>{locale === "en" ? "I confirm this tax applies to our eligible sales and authorize automatic application according to configured rules." : "Je confirme que cette taxe s'applique à nos ventes éligibles et j'autorise son application automatique selon les règles configurées."}</span>
    </label> : null}
  </section>;
}
