"use client";

import { useState, type FormEvent } from "react";
import type { ConsoleMcpGovernance } from "@/lib/console/console-ai-mcp";

function Count({ value }: { value: number | null }) {
  return <span className="tabular-nums">{value === null ? "—" : value}</span>;
}

export function ConsoleAiMcpPanel({
  initial, locale, canManage,
}: {
  initial: ConsoleMcpGovernance; locale: "fr" | "en"; canManage: boolean;
}) {
  const en = locale === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const [servers, setServers] = useState(initial.servers);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);
  const current = servers.find((s) => s.code === selected);

  async function updateControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || current.suspended === null || current.revision === null || busy || !canManage || !confirmed || reason.trim().length < 8) return;
    setBusy(true);
    setFeedback("");
    setSuccess(false);
    try {
      const response = await fetch("/api/admin/ai/mcp/control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          serverCode: current.code, expectedRevision: current.revision,
          suspended: !current.suspended, reason: reason.trim(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setFeedback(result?.error || t("Modification non confirmée. Vérifiez les permissions et actualisez.", "Change not confirmed. Check permissions and refresh."));
        return;
      }
      setServers((previous) => previous.map((s) => s.code === result.serverCode
        ? { ...s, suspended: Boolean(result.suspended), revision: result.revision }
        : s));
      setSuccess(true);
      setFeedback(t("Contrôle MCP enregistré et audité.", "MCP control saved and audited."));
      setSelected(null);
      setReason("");
      setConfirmed(false);
    } catch {
      setFeedback(t("Connexion interrompue : état non confirmé.", "Connection lost: state not confirmed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4" aria-label={t("Gouvernance MCP et assistants", "MCP and assistant governance")}>
      <div>
        <h3 className="text-xl font-black text-dtsc-ink">{t("Intégrations MCP et assistants", "MCP integrations and assistants")}</h3>
        <p className="mt-1 text-sm text-dtsc-muted">{t("Configuration certifiée, autorisations et observations restent des étapes distinctes. Les comptes connectés ne constituent pas une mesure des outils utilisables.", "Certification, grants and observations are distinct. Connected accounts are not a measure of usable tools.")}</p>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Télémétrie", "Telemetry")}: {initial.telemetry === "AVAILABLE" ? t("Chargée", "Loaded") : t("Partiellement indisponible", "Partially unavailable")} · {t("Audits depuis", "Audits since")} {new Date(initial.auditedSince).toLocaleDateString(en ? "en-US" : "fr-FR")}</p>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {servers.map((server) => (
          <article key={server.code} className="dtsc-card min-w-0 overflow-hidden p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="break-words font-black text-dtsc-ink">{server.label}</h4>
                <p className="mt-1 break-all text-xs text-dtsc-muted">{server.code}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-bold ${server.suspended ? "border-rose-500 text-rose-700 dark:text-rose-300" : "border-dtsc-border text-dtsc-muted"}`}>
                {server.suspended === null ? t("Statut de contrôle indisponible", "Control state unavailable") : server.suspended ? t("Suspendu par DTSC", "Suspended by DTSC") : server.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-dtsc-muted">{t("Certifié", "Certified")}</dt><dd className="font-bold text-dtsc-ink">{server.certified ? t("Oui", "Yes") : t("Non", "No")}</dd></div>
              <div><dt className="text-dtsc-muted">{t("Configuration", "Configuration")}</dt><dd className="font-bold text-dtsc-ink">{server.configured ? t("Disponible", "Present") : t("Incomplète", "Incomplete")}</dd></div>
              <div><dt className="text-dtsc-muted">{t("Autorisations OAuth stockées", "Stored OAuth grants")}</dt><dd className="font-bold text-dtsc-ink"><Count value={server.connectedGrants} /></dd></div>
              <div><dt className="text-dtsc-muted">{t("Outils activés", "Enabled bindings")}</dt><dd className="font-bold text-dtsc-ink"><Count value={server.enabledBindings} /></dd></div>
              <div><dt className="text-dtsc-muted">{t("Accessibilité du service", "Remote reachability")}</dt><dd className="font-bold text-dtsc-ink">{t("Non mesurée", "Not measured")}</dd></div>
              <div><dt className="text-dtsc-muted">{t("Portée", "Scope")}</dt><dd className="font-bold text-dtsc-ink">{server.scope}</dd></div>
            </dl>
            <p className="mt-3 break-words text-xs text-dtsc-muted">{t("Découverte", "Discovery")}: {server.discovery ? `${server.discovery.discoveredAt.slice(0, 10)} · ${server.discovery.toolCount} ${t("outils", "tools")} · ${server.discovery.compatible ? t("compatible", "compatible") : t("changement incompatible", "incompatible change")}` : t("Aucune découverte enregistrée", "No recorded discovery")}</p>
            <p className="mt-2 text-xs text-dtsc-muted">{t("Événements sur 7 jours", "Events over 7 days")}: {server.audit ? `${server.audit.successful} ${t("succès", "success")} · ${server.audit.denied} ${t("refus", "denied")} · ${server.audit.failed} ${t("échecs", "failed")}` : t("Non disponibles", "Unavailable")}</p>
            <p className="mt-2 text-xs text-dtsc-muted" role="status">{t("Lectures distantes réussies (7 jours)", "Successful remote READ calls (7 days)")}: {server.readEvidence === null
              ? t("Preuve indisponible", "Evidence unavailable")
              : server.readEvidence.successfulCalls7d === 0
                ? t("Aucun appel confirmé", "No confirmed calls")
                : `${server.readEvidence.successfulCalls7d} · ${t("Dernier succès", "Last success")} ${server.readEvidence.latestSuccessAt ? new Date(server.readEvidence.latestSuccessAt).toLocaleString(en ? "en-US" : "fr-FR") : t("date inconnue", "unknown date")}`}
            </p>
            <p className="mt-1 text-[0.7rem] text-dtsc-muted">{t("Cette preuve historique ne certifie ni le compte courant, ni la disponibilité actuelle du fournisseur. La recette E2E reste obligatoire.", "Historical evidence does not certify the current account or current provider availability. Real E2E acceptance is still required.")}</p>
            {canManage && server.suspended !== null && server.revision !== null ? <button type="button" onClick={() => { setSelected(server.code); setReason(""); setConfirmed(false); setFeedback(""); }} className="mt-4 min-h-11 rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink focus-visible:outline-2 focus-visible:outline-cyan-500">{server.suspended ? t("Préparer la réactivation", "Prepare resume") : t("Préparer une suspension", "Prepare suspension")}</button> : null}
          </article>
        ))}
      </div>
      {current && canManage ? <form onSubmit={updateControl} className="dtsc-card space-y-3 p-4">
        <h4 className="font-bold text-dtsc-ink">{current.suspended ? t("Réactiver le serveur", "Resume server") : t("Suspendre le serveur", "Suspend server")} — {current.label}</h4>
        <p className="text-xs text-dtsc-muted">{t("Révision", "Revision")} {current.revision} · {t("La réactivation ne certifie pas les outils et ne remplace pas OAuth.", "Resuming does not certify tools or grant OAuth access.")}</p>
        <label className="block text-sm font-medium text-dtsc-ink">{t("Motif du changement", "Reason for change")}
          <textarea required minLength={8} maxLength={500} rows={2} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-dtsc-ink" />
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm text-dtsc-ink"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />{t("Je confirme l'impact sur toutes les entreprises et connexions utilisant ce serveur.", "I confirm the impact on every organization and connection using this server.")}</label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || !confirmed || reason.trim().length < 8} className="min-h-11 rounded-xl bg-cyan-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? t("Enregistrement…", "Saving…") : t("Confirmer et journaliser", "Confirm and audit")}</button>
          <button type="button" disabled={busy} onClick={() => setSelected(null)} className="min-h-11 rounded-xl border border-dtsc-border px-4 text-sm text-dtsc-ink">{t("Annuler", "Cancel")}</button>
        </div>
      </form> : null}
      {feedback ? <p role={success ? "status" : "alert"} className="text-sm text-dtsc-ink">{feedback}</p> : null}
      <article className="dtsc-card min-w-0 space-y-2 overflow-hidden p-4">
        <h4 className="font-black text-dtsc-ink">{t("Outils MCP liés au registre", "Registered MCP tool bindings")}</h4>
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-xs"><thead><tr className="border-b border-dtsc-border text-dtsc-muted"><th className="py-2">{t("Outil", "Tool")}</th><th>{t("Serveur", "Server")}</th><th>{t("Activé", "Enabled")}</th><th>{t("Schéma validé", "Schema matched")}</th><th>{t("Accès", "Access")}</th></tr></thead><tbody>{initial.bindings.map((binding) => <tr key={binding.code} className="border-b border-dtsc-border/60 text-dtsc-ink"><th scope="row" className="break-all py-2">{binding.code}</th><td>{binding.serverCode}</td><td>{binding.enabled ? t("Oui", "Yes") : t("Non", "No")}</td><td>{binding.discoveryMatches === null ? t("Non vérifié", "Not checked") : binding.discoveryMatches ? t("Correspond", "Matches") : t("Différent", "Different")}</td><td>{binding.requiredPermissions} {t("permissions", "permissions")}</td></tr>)}</tbody></table></div>
        {initial.bindings.length === 0 ? <p className="text-sm text-dtsc-muted">{t("Aucun binding MCP activable dans la configuration actuelle.", "No MCP bindings registered in the current configuration.")}</p> : null}
      </article>
      <article className="dtsc-card min-w-0 space-y-2 overflow-hidden p-4">
        <h4 className="font-black text-dtsc-ink">{t("Assistants et politiques", "Assistants and policies")}</h4>
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-xs"><thead><tr className="border-b border-dtsc-border text-dtsc-muted"><th className="py-2">{t("Assistant", "Assistant")}</th><th>{t("Contexte", "Scope")}</th><th>{t("Outils", "Tools")}</th><th>{t("Connaissances", "Knowledge")}</th><th>{t("Données", "Data")}</th></tr></thead><tbody>{initial.assistants.map((assistant) => <tr key={assistant.code} className="border-b border-dtsc-border/60 text-dtsc-ink"><th className="break-words py-2">{assistant.code}</th><td>{assistant.scope}</td><td>{assistant.toolPolicy}</td><td>{assistant.knowledgePolicy}</td><td>{assistant.dataPolicy}</td></tr>)}</tbody></table></div>
      </article>
    </section>
  );
}
