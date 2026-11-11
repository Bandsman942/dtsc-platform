"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";
import formsFr from "@/locales/retail-transaction-forms.fr.json";
import formsEn from "@/locales/retail-transaction-forms.en.json";

type Policy = { expiryMode: "ALLOW" | "WARN" | "BLOCK"; enforceFefo: boolean; warningDays: number; transferReception: "IMMEDIATE" | "CONFIRMED" };
type PolicyState = { revision: number; policy: Policy; canManage: boolean };

export function RetailInventoryPolicySettings({ organizationId, locale }: { organizationId: string; locale: "fr" | "en" }) {
  const copy = (locale === "fr" ? formsFr : formsEn).inventoryPolicy;
  const [state, setState] = useState<PolicyState | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/inventory-policy`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (PolicyState & { message?: string }) | null;
      if (!response.ok || !payload?.policy) throw new Error(payload?.message || copy.loadError);
      setState(payload);
      setPolicy(payload.policy);
    } catch (caught) {
      setError(customerFacingError(caught, locale));
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, locale, organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!state?.canManage || !policy || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/inventory-policy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: state.revision, policy }),
      });
      const payload = await response.json().catch(() => null) as (PolicyState & { message?: string }) | null;
      if (!response.ok || !payload?.policy) throw new Error(payload?.message || copy.saveError);
      setState(payload);
      setPolicy(payload.policy);
      toastSuccess(copy.saved);
    } catch (caught) {
      const message = customerFacingError(caught, locale);
      setError(message);
      toastError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section data-testid="retail-inventory-policy" className="min-w-0 max-w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-dtsc-ink">{copy.title}</h2>
          <p className="mt-1 text-sm leading-5 text-dtsc-muted">{copy.description}</p>
        </div>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-dtsc-muted" role="status">{copy.loading}</p> : null}
      {!loading && policy ? (
        <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold text-dtsc-ink">
            {copy.expiryMode}
            <select value={policy.expiryMode} disabled={!state?.canManage || saving} onChange={(event) => setPolicy((current) => current ? { ...current, expiryMode: event.target.value as Policy["expiryMode"] } : current)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink focus-visible:ring-2 focus-visible:ring-cyan-400">
              <option value="ALLOW">{copy.allow}</option>
              <option value="WARN">{copy.warn}</option>
              <option value="BLOCK">{copy.block}</option>
            </select>
            <span className="mt-1 block text-xs font-normal leading-5 text-dtsc-muted">{copy.expiryHelp}</span>
          </label>
          <label className="min-w-0 text-sm font-semibold text-dtsc-ink">
            {copy.warningDays}
            <input type="number" min={1} max={365} step={1} value={policy.warningDays} disabled={!state?.canManage || saving} onChange={(event) => setPolicy((current) => current ? { ...current, warningDays: Number(event.target.value) } : current)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink focus-visible:ring-2 focus-visible:ring-cyan-400" />
            <span className="mt-1 block text-xs font-normal leading-5 text-dtsc-muted">{copy.warningHelp}</span>
          </label>
          <label className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:col-span-2">
            <input type="checkbox" checked={policy.enforceFefo} disabled={!state?.canManage || saving} onChange={(event) => setPolicy((current) => current ? { ...current, enforceFefo: event.target.checked } : current)} className="mt-1 h-4 w-4 accent-cyan-600" />
            <span className="min-w-0"><span className="block text-sm font-bold text-dtsc-ink">{copy.fefo}</span><span className="mt-1 block text-xs leading-5 text-dtsc-muted">{copy.fefoHelp}</span></span>
          </label>
          <label className="min-w-0 text-sm font-semibold text-dtsc-ink sm:col-span-2">
            {copy.transferReception}
            <select value={policy.transferReception} disabled={!state?.canManage || saving} onChange={(event) => setPolicy((current) => current ? { ...current, transferReception: event.target.value as Policy["transferReception"] } : current)} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink focus-visible:ring-2 focus-visible:ring-cyan-400">
              <option value="IMMEDIATE">{copy.transferImmediate}</option>
              <option value="CONFIRMED">{copy.transferConfirmed}</option>
            </select>
            <span className="mt-1 block text-xs font-normal leading-5 text-dtsc-muted">{copy.transferHelp}</span>
          </label>
          {policy.expiryMode === "ALLOW" ? <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-700 dark:text-amber-200 sm:col-span-2">{locale === "en" ? "Expiry protection is not enforced. Switch to BLOCK to reject expired lots after verifying your lot data." : "La protection de péremption n’est pas appliquée. Choisissez BLOQUER pour refuser les lots périmés après vérification des données."}</p> : null}
          {policy.expiryMode === "WARN" ? <p role="status" className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-xs font-bold text-orange-700 dark:text-orange-200 sm:col-span-2">{locale === "en" ? "Warning mode is advisory; only BLOCK guarantees server rejection." : "Le mode avertissement reste indicatif ; seul BLOQUER garantit le rejet côté serveur."}</p> : null}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <p className="flex min-w-0 items-start gap-2 text-xs text-dtsc-muted"><AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600" />{copy.legacyNotice}</p>
            {state?.canManage ? <Button type="button" disabled={saving || policy.warningDays < 1 || policy.warningDays > 365 || !Number.isInteger(policy.warningDays)} onClick={() => void save()}>{saving ? copy.saving : copy.save}</Button> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
