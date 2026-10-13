"use client";

import { useState, type FormEvent } from "react";
import type { AiPlatformPolicy } from "@/lib/ai/platform-runtime-policy";

type CeilingKey = "maxSteps" | "maxToolCalls" | "maxTokens" | "maxEstimatedCost" | "maxDurationMs";
type Tier = "STARTER" | "BUSINESS" | "ENTERPRISE";
const TIERS: Tier[] = ["STARTER", "BUSINESS", "ENTERPRISE"];
const FIELDS: CeilingKey[] = ["maxSteps", "maxToolCalls", "maxTokens", "maxEstimatedCost", "maxDurationMs"];

export function ConsoleAiPolicyManager({
  initialPolicy,
  providerCodes,
  modelCodes,
  canManage,
  locale,
}: {
  initialPolicy: AiPlatformPolicy;
  providerCodes: string[];
  modelCodes: string[];
  canManage: boolean;
  locale: "fr" | "en";
}) {
  const en = locale === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const [policy, setPolicy] = useState<AiPlatformPolicy>(initialPolicy);
  const [revision, setRevision] = useState(initialPolicy.revision);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; createdAt: string; reason: string; nextValue: AiPlatformPolicy }> | null>(null);
  async function loadHistory() {
    setMessage("");
    try {
      const response = await fetch("/api/admin/ai/policy", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.changes) throw new Error("READ_ERROR");
      setHistory(data.changes as Array<{ id: string; createdAt: string; reason: string; nextValue: AiPlatformPolicy }>);
    } catch {
      setMessage(t("Historique indisponible, veuillez réessayer.", "Revision history unavailable, please retry."));
    }
  }
  function stageRollback(previous: AiPlatformPolicy) {
    setPolicy((current) => ({
      ...current,
      disabledProviderCodes: previous.disabledProviderCodes,
      disabledModelCodes: previous.disabledModelCodes,
      agentCeilings: previous.agentCeilings,
    }));
    setReason(t("Restauration d'une politique précédente, à confirmer.", "Restore a previous policy, pending confirmation."));
    setSaved(false);
    setMessage(t("Ancienne configuration préparée. Vérifiez et publiez pour appliquer.", "Previous settings staged. Review and publish to apply."));
  }

  const toggleCode = (kind: "disabledProviderCodes" | "disabledModelCodes", code: string, checked: boolean) => {
    setPolicy((current) => ({
      ...current,
      [kind]: checked ? [...current[kind], code] : current[kind].filter((entry) => entry !== code),
    }));
    setSaved(false);
  };
  const setLimit = (tier: Tier, field: CeilingKey, raw: string) => {
    setPolicy((current) => {
      const perTier = { ...current.agentCeilings[tier] };
      if (raw.trim() === "") delete perTier[field];
      else perTier[field] = Number(raw);
      return { ...current, agentCeilings: { ...current.agentCeilings, [tier]: perTier } };
    });
    setSaved(false);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    setMessage("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/ai/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          expectedRevision: revision,
          disabledProviderCodes: policy.disabledProviderCodes,
          disabledModelCodes: policy.disabledModelCodes,
          agentCeilings: policy.agentCeilings,
          reason: reason.trim(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.policy) {
        setMessage(result?.error || t("Enregistrement impossible. Vérifiez vos permissions et réessayez.", "Unable to save. Check your permissions and retry."));
        return;
      }
      setPolicy(result.policy as AiPlatformPolicy);
      setRevision(result.policy.revision as number);
      setReason("");
      setSaved(true);
      setMessage(t("Politique enregistrée et appliquée aux prochaines exécutions.", "Policy saved and applied to upcoming executions."));
    } catch {
      setMessage(t("Connexion interrompue. Aucune confirmation d'enregistrement.", "Connection interrupted. Save was not confirmed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dtsc-card min-w-0 space-y-4 p-4" aria-label={t("Politique opérationnelle IA", "AI runtime policy")}>
      <div>
        <h4 className="text-base font-black text-dtsc-ink">{t("Politique IA publiée", "Published AI policy")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Version", "Revision")} {revision} · {t("Les restrictions sont appliquées côté serveur, sans modifier les droits commerciaux.", "Restrictions are enforced server-side without changing commercial entitlements.")}</p>
      </div>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={!canManage || busy} className="space-y-2">
          <legend className="mb-2 text-sm font-bold text-dtsc-ink">{t("Fournisseurs suspendus", "Disabled providers")}</legend>
          <div className="flex flex-wrap gap-2">
            {providerCodes.map((code) => <label key={code} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-xs text-dtsc-ink"><input type="checkbox" checked={policy.disabledProviderCodes.includes(code)} onChange={(event) => toggleCode("disabledProviderCodes", code, event.target.checked)} />{code}</label>)}
          </div>
          <p className="text-xs text-dtsc-muted">{t("Une suspension retire le fournisseur des choix de routage, y compris de secours.", "Disabling a provider removes it from normal and fallback routing.")}</p>
        </fieldset>
        <fieldset disabled={!canManage || busy} className="space-y-2">
          <legend className="mb-2 text-sm font-bold text-dtsc-ink">{t("Modèles suspendus", "Disabled models")}</legend>
          <div className="max-h-36 overflow-y-auto rounded-xl border border-dtsc-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">{modelCodes.map((code) => <label key={code} className="flex min-h-10 min-w-0 items-center gap-2 text-xs text-dtsc-ink"><input type="checkbox" checked={policy.disabledModelCodes.includes(code)} onChange={(event) => toggleCode("disabledModelCodes", code, event.target.checked)} /><span className="break-all">{code}</span></label>)}</div>
          </div>
        </fieldset>
        <fieldset disabled={!canManage || busy} className="space-y-3">
          <legend className="mb-2 text-sm font-bold text-dtsc-ink">{t("Plafonds Agent supplémentaires", "Additional Agent ceilings")}</legend>
          <p className="text-xs text-dtsc-muted">{t("Laissez un champ vide pour conserver le plafond serveur. Les valeurs supérieures au maximum serveur sont refusées.", "Leave empty to keep the server cap. Values above server safety limits are rejected.")}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => <div key={tier} className="min-w-0 space-y-2 rounded-xl border border-dtsc-border p-3">
              <h5 className="text-sm font-bold text-dtsc-ink">{tier}</h5>
              {FIELDS.map((field) => <label key={field} className="block text-xs text-dtsc-muted"><span className="block">{field}</span><input type="number" min={field === "maxToolCalls" ? 0 : field === "maxDurationMs" ? 1000 : 1} step={field === "maxEstimatedCost" ? "0.01" : "1"} value={policy.agentCeilings[tier]?.[field] ?? ""} onChange={(event) => setLimit(tier, field, event.target.value)} placeholder={t("Plafond serveur", "Server cap")} className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm text-dtsc-ink" /></label>)}
            </div>)}
          </div>
        </fieldset>
        {canManage ? <>
          <label className="block text-sm font-bold text-dtsc-ink">{t("Motif obligatoire de la modification", "Required change reason")}
            <textarea value={reason} required minLength={8} maxLength={500} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-2 min-h-20 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" placeholder={t("Indiquez le changement, son impact et le motif.", "Describe the change, impact and reason.")} />
          </label>
          <button type="submit" disabled={busy || reason.trim().length < 8} className="min-h-11 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? t("Enregistrement…", "Saving…") : t("Publier la politique", "Publish policy")}</button>
        </> : <p className="text-xs font-medium text-dtsc-muted">{t("Accès en consultation uniquement. Permission CONSOLE_AI_MANAGE requise pour modifier.", "Read-only. CONSOLE_AI_MANAGE permission required for changes.")}</p>}
        {message ? <p aria-live="polite" role={saved ? "status" : "alert"} className={"text-sm "+(saved ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{message}</p> : null}
      </form>
      <div className="space-y-2 border-t border-dtsc-border pt-4">
        <button type="button" onClick={loadHistory} className="min-h-10 rounded-xl border border-dtsc-border px-3 py-2 text-xs font-bold text-dtsc-ink">{t("Afficher l'historique des politiques", "Show policy history")}</button>
        {history !== null ? <div className="max-h-52 space-y-2 overflow-y-auto" aria-label={t("Historique des versions", "Policy revisions")}>
          {history.length === 0 ? <p className="text-xs text-dtsc-muted">{t("Aucune modification publiée.", "No published changes yet.")}</p> : history.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dtsc-border px-3 py-2 text-xs text-dtsc-ink">
              <div className="min-w-0"><p className="font-bold">{t("Version", "Revision")} {entry.nextValue.revision} · {new Date(entry.createdAt).toLocaleString(en ? "en-US" : "fr-FR")}</p><p className="break-words text-dtsc-muted">{entry.reason}</p></div>
              {canManage ? <button type="button" disabled={busy} onClick={() => stageRollback(entry.nextValue)} className="min-h-10 rounded-lg border border-cyan-500 px-3 font-bold text-cyan-700 dark:text-cyan-300">{t("Restaurer", "Restore")}</button> : null}
            </div>
          ))}
        </div> : null}
        <p className="text-xs text-dtsc-muted">{t("Une restauration crée une nouvelle version avec un motif et la même validation de sécurité que toute publication.", "Restoring creates a new audited revision with the same safety validation as any change.")}</p>
      </div>
    </section>
  );
}
