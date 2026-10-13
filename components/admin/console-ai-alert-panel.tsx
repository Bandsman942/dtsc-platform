"use client";

import { useState, type FormEvent } from "react";
import type { ConsoleAiAlert, ConsoleAiAlertSnapshot } from "@/lib/ai/governance-alerts";

const TITLES = {
  MODEL_FAILURES: { fr: "Échecs des appels IA", en: "AI model failures" },
  TOOL_DENIALS: { fr: "Refus d'outils IA", en: "AI tool denials" },
  KNOWLEDGE_INDEX_FAILURES: { fr: "Échecs d'indexation", en: "Knowledge indexing failures" },
} as const;

export function ConsoleAiAlertPanel({
  initial, canManage, locale,
}: { initial: ConsoleAiAlertSnapshot; canManage: boolean; locale: "fr" | "en" }) {
  const en = locale === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const [alerts, setAlerts] = useState(initial.alerts);
  const [editing, setEditing] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(5);
  const [severity, setSeverity] = useState<"WARNING" | "CRITICAL">("WARNING");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selected = alerts.find((alert) => alert.code === editing);

  function open(code: string) {
    const rule = alerts.find((a) => a.code === code);
    if (!rule || rule.state === "UNAVAILABLE") return;
    setEditing(code);
    setEnabled(rule.enabled ?? true);
    setThreshold(rule.threshold ?? 5);
    setSeverity(rule.severity ?? "WARNING");
    setReason("");
    setFeedback("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !selected || selected.revision === null || busy || reason.trim().length < 8) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/ai/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          code: selected.code, expectedRevision: selected.revision,
          enabled, threshold, severity, reason: reason.trim(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setFeedback(result?.error || t("Publication non confirmée. Actualisez la règle.", "Save not confirmed. Refresh this rule."));
        return;
      }
      const nextState = (currentTotal: number | null): ConsoleAiAlert["state"] =>
        !result.enabled ? "DISABLED" : currentTotal === null ? "UNAVAILABLE"
          : currentTotal >= result.threshold ? "TRIGGERED" : "BELOW_THRESHOLD";
      setAlerts((current) => current.map((alert) => alert.code === result.code ? {
        ...alert, revision: result.revision, threshold: result.threshold, severity: result.severity, enabled: result.enabled,
        state: nextState(alert.total),
      } : alert));
      setEditing(null);
      setReason("");
      setFeedback(t("Règle d'alerte enregistrée avec audit.", "Alert policy published with audit."));
    } catch {
      setFeedback(t("Connexion interrompue. Aucun enregistrement confirmé.", "Connection interrupted. No confirmed save."));
    } finally {
      setBusy(false);
    }
  }
  const stateLabel = (state: string) => {
    if (state === "TRIGGERED") return t("Seuil atteint", "Threshold reached");
    if (state === "BELOW_THRESHOLD") return t("Sous le seuil", "Below threshold");
    if (state === "DISABLED") return t("Désactivée", "Disabled");
    if (state === "NOT_CONFIGURED") return t("Non configurée", "Not configured");
    return t("Indisponible", "Unavailable");
  };
  return <section className="dtsc-card min-w-0 space-y-3 p-4">
    <h3 className="text-base font-black text-dtsc-ink">{t("Alertes de supervision IA", "AI monitoring alerts")}</h3>
    <p className="text-xs text-dtsc-muted">{t("Signaux calculés sur la période choisie, pas de notifications automatiques.", "Signals evaluated within the selected period; no automatic notifications.")} {initial.period.from.slice(0, 10)} – {initial.period.to.slice(0, 10)} · {t("Actualisé", "Refreshed")}: {new Date(initial.period.refreshedAt).toLocaleString(en ? "en-US" : "fr-FR")}</p>
    <div className="grid min-w-0 gap-3 md:grid-cols-3">{alerts.map((alert) => <article key={alert.code} className="min-w-0 rounded-xl border border-dtsc-border p-3">
      <h4 className="text-sm font-bold text-dtsc-ink">{TITLES[alert.code][en ? "en" : "fr"]}</h4>
      <p className="mt-1 break-words text-xs text-dtsc-muted">{alert.source}</p>
      <p className="mt-2 text-lg font-black text-dtsc-ink">{alert.total === null ? "—" : alert.total.toLocaleString(en ? "en-US" : "fr-FR")}</p>
      <p className="text-xs text-dtsc-muted">{stateLabel(alert.state)} · {t("Seuil", "Threshold")}: {alert.threshold ?? "—"} · {t("Priorité", "Severity")}: {alert.severity ?? "—"}</p>
      {canManage && alert.state !== "UNAVAILABLE" ? <button type="button" onClick={() => open(alert.code)} className="mt-3 min-h-11 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink focus-visible:outline-2 focus-visible:outline-cyan-500">{t("Configurer", "Configure")}</button> : null}
    </article>)}</div>
    {selected && canManage ? <form onSubmit={save} className="space-y-3 rounded-xl border border-dtsc-border p-3">
      <h4 className="text-sm font-bold text-dtsc-ink">{TITLES[selected.code][en ? "en" : "fr"]} — {t("révision", "revision")} {selected.revision}</h4>
      <label className="flex min-h-10 items-center gap-2 text-sm text-dtsc-ink"><input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => setEnabled(e.target.checked)} /> {t("Règle active", "Rule enabled")}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-dtsc-ink">{t("Seuil sur la période", "Threshold per selected period")}<input type="number" min={1} max={1000000} value={threshold} disabled={busy} onChange={(e) => setThreshold(Number(e.target.value))} className="mt-1 block min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-dtsc-ink" /></label>
        <label className="text-sm text-dtsc-ink">{t("Criticité", "Severity")}<select value={severity} disabled={busy} onChange={(e) => setSeverity(e.target.value as "WARNING" | "CRITICAL")} className="mt-1 block min-h-11 w-full rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-dtsc-ink"><option value="WARNING">{t("Attention", "Warning")}</option><option value="CRITICAL">{t("Critique", "Critical")}</option></select></label>
      </div>
      <label className="block text-sm text-dtsc-ink">{t("Justification obligatoire", "Required reason")}<textarea value={reason} disabled={busy} required minLength={8} maxLength={500} rows={2} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-dtsc-ink" /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || reason.trim().length < 8} className="min-h-11 rounded-lg bg-cyan-600 px-4 text-xs font-bold text-white disabled:opacity-50">{t("Publier et auditer", "Publish and audit")}</button><button type="button" disabled={busy} onClick={() => setEditing(null)} className="min-h-11 rounded-lg border border-dtsc-border px-4 text-xs text-dtsc-ink">{t("Annuler", "Cancel")}</button></div>
    </form> : null}
    {feedback ? <p role="status" aria-live="polite" className="text-sm text-dtsc-muted">{feedback}</p> : null}
  </section>;
}
