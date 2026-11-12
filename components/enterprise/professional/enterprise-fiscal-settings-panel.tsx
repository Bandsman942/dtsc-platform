"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Config = {
  functionalCurrencyCode: string;
  presentationCurrencyCode: string | null;
  inventoryValuationMethod: "WEIGHTED_AVERAGE" | "FIFO";
  reconciliationTolerance: string | number;
  automaticPostingEnabled: boolean;
  taxPolicyJson?: Record<string, unknown> | null;
  revision: number;
};
type Payload = { configuration?: Config | null; ready?: boolean };
type Props = { organizationId: string; country?: string | null; locale?: string | null };

export function EnterpriseFiscalSettingsPanel({ organizationId, country, locale: rawLocale }: Props) {
  const en = rawLocale === "en";
  const endpoint = `/api/enterprise/${organizationId}/finance/configuration`;
  const [config, setConfig] = useState<Config | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setMessage(""); setError("");
    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) { setAllowed(false); return null; }
        if (!response.ok) throw new Error("read failed");
        return response.json() as Promise<Payload>;
      })
      .then((body) => {
        if (!body || controller.signal.aborted) return;
        const current = body.configuration ?? null;
        setConfig(current);
        setEnabled(current?.taxPolicyJson?.automaticSalesTaxEnabled === true);
        setAllowed(true);
      })
      .catch((exception: unknown) => {
        if (exception instanceof Error && exception.name === "AbortError") return;
        setError(en ? "Unable to load financial settings." : "Impossible de charger les paramètres financiers.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, en]);

  async function save() {
    if (!config || saving) return;
    setSaving(true); setError(""); setMessage("");
    const taxPolicy = { ...(config.taxPolicyJson || {}), automaticSalesTaxEnabled: enabled };
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          functionalCurrencyCode: config.functionalCurrencyCode,
          presentationCurrencyCode: config.presentationCurrencyCode,
          inventoryValuationMethod: config.inventoryValuationMethod,
          reconciliationTolerance: String(config.reconciliationTolerance),
          automaticPostingEnabled: config.automaticPostingEnabled,
          taxPolicyJson: taxPolicy,
          revision: config.revision,
        }),
      });
      if (!response.ok) throw new Error("write failed");
      const latest = await fetch(endpoint, { cache: "no-store" });
      if (!latest.ok) throw new Error("reload failed");
      const body = await latest.json() as Payload;
      setConfig(body.configuration || null);
      setEnabled(body.configuration?.taxPolicyJson?.automaticSalesTaxEnabled === true);
      setMessage(en ? "Fiscal settings saved and applied to future eligible transactions." : "Paramètres fiscaux enregistrés pour les prochaines opérations éligibles.");
    } catch {
      setError(en ? "Unable to save. Check permissions, setup and concurrent changes." : "Enregistrement impossible. Vérifiez les droits, les prérequis et les modifications concurrentes.");
    } finally { setSaving(false); }
  }

  return <div className="mt-4 min-w-0 max-w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <Settings2 className="h-5 w-5 text-sky-400" aria-hidden="true" />
      <div className="min-w-0"><h3 className="font-black text-dtsc-ink">{en ? "Financial & fiscal configuration" : "Configuration financière et fiscale"}</h3>
        <p className="text-xs text-dtsc-muted">{en ? "Tax automation is separate from organization tax registration and the active tax codes." : "L'automatisation est distincte de l'immatriculation et des taxes activées."}</p>
      </div>
    </div>
    {loading ? <p className="text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> :
      !allowed ? <p className="flex items-start gap-2 text-sm text-dtsc-muted"><LockKeyhole className="h-4 w-4 shrink-0" />{en ? "Financial permissions are required to configure tax rules." : "La permission Finance est nécessaire pour modifier les règles fiscales."}</p> :
      !config ? <p className="text-sm text-dtsc-muted">{en ? "Initialize the finance module to enable fiscal configuration." : "Initialisez le module Finances pour configurer la fiscalité."}</p> :
      <div className="space-y-3">
        <div className="grid min-w-0 gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-dtsc-muted">{en ? "Company tax country" : "Pays fiscal de l'entreprise"} : </span><strong>{country || (en ? "Not specified" : "Non renseigné")}</strong></div>
          <div><span className="text-dtsc-muted">{en ? "Accounting currency" : "Devise comptable"} : </span><strong>{config.functionalCurrencyCode}</strong></div>
        </div>
        <label className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={saving} />
          <span><strong>{en ? "Automatically apply eligible sales taxes" : "Calculer automatiquement les taxes éligibles à la vente"}</strong>
            <span className="mt-1 block text-xs text-dtsc-muted">{en ? "Only explicitly taxable items with one matching, active, company-authorized tax in the applicable jurisdiction are eligible. Never applies to whole Mobile Money floats." : "Uniquement pour les articles imposables, avec une taxe active, autorisée et non ambiguë dans la juridiction concernée. Les dépôts/retraits Mobile Money ne deviennent pas des ventes taxables."}</span>
          </span>
        </label>
        <p className="text-xs text-dtsc-muted">{en ? "Changing these options does not alter previously issued invoices. Legal invoice certification is handled separately." : "Cette modification ne recalcule aucune facture émise. La certification fiscale des factures reste un processus distinct."}</p>
        <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? (en ? "Saving…" : "Enregistrement…") : (en ? "Save fiscal settings" : "Enregistrer les paramètres fiscaux")}</Button>
      </div>}
    {error ? <p role="alert" className="mt-2 text-sm text-red-400">{error}</p> : null}
    {message ? <p role="status" className="mt-2 flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" />{message}</p> : null}
  </div>;
}
