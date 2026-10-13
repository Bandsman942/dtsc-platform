import type { ConsoleAiKnowledgeSecurity } from "@/lib/console/console-ai-knowledge-security";

export function ConsoleAiKnowledgeSecurityPanel({
  data, locale,
}: { data: ConsoleAiKnowledgeSecurity; locale: "fr" | "en" }) {
  const en = locale === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const n = (v: number) => v.toLocaleString(en ? "en-US" : "fr-FR");
  const statuses = ["READY", "PROCESSING", "FAILED", "OTHER"] as const;
  const statusLabel = (status: typeof statuses[number]) => ({
    READY: t("Prête", "Ready"),
    PROCESSING: t("En traitement", "Processing"),
    FAILED: t("Échec", "Failed"),
    OTHER: t("Autre", "Other"),
  })[status];

  return (
    <section className="min-w-0 space-y-4" aria-label={t("Connaissances et sécurité IA", "AI knowledge and safety")}>
      <div>
        <h3 className="text-xl font-black text-dtsc-ink">{t("Connaissances et sécurité IA", "AI knowledge and safety")}</h3>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Période", "Window")}: {data.window.from.slice(0, 10)} – {data.window.to.slice(0, 10)} · {t("Actualisé", "Refreshed")} {new Date(data.window.refreshedAt).toLocaleString(en ? "en-US" : "fr-FR")} · {t("Nombre de sources et d'événements, sans contenu privé", "Source and event counts, without private content")}</p>
      </div>
      <article className="dtsc-card min-w-0 overflow-hidden p-4">
        <h4 className="font-bold text-dtsc-ink">{t("Sources documentaires", "Document sources")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Documents personnels et sources de connaissance des entreprises", "Personal documents and enterprise knowledge sources")}</p>
        {data.knowledge === null ? <p className="mt-3 text-sm text-dtsc-muted">{t("Indicateurs indisponibles", "Metrics unavailable")}</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead><tr className="border-b border-dtsc-border text-xs text-dtsc-muted"><th className="py-2">{t("Statut", "Status")}</th><th>{t("Personnel", "Personal")}</th><th>{t("Entreprise (hors archives)", "Enterprise (not archived)")}</th></tr></thead>
              <tbody>{statuses.map((status) => <tr key={status} className="border-b border-dtsc-border/60">
                <th scope="row" className="py-2 text-dtsc-ink">{statusLabel(status)}</th>
                <td className="tabular-nums">{n(data.knowledge!.personal[status])}</td>
                <td className="tabular-nums">{n(data.knowledge!.enterprise[status])}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </article>
      <article className="dtsc-card min-w-0 overflow-hidden p-4">
        <h4 className="text-sm font-bold text-dtsc-ink">{t("Versions d'indexation documentaire", "Document index versions")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Index legacy conservé, ou source réindexée selon un index versionné. Une version d'index ne prouve pas qu'une citation ait été utilisée.", "Legacy index retained or source indexed with a versioned index. Index version is not proof of a cited retrieval.")}</p>
        {data.indexing === null ? <p className="mt-2 text-sm text-dtsc-muted">{t("Répartition indisponible", "Distribution unavailable")}</p>
          : <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div><span className="block text-dtsc-muted">{t("Personnel · historique", "Personal · legacy")}</span><strong className="text-lg text-dtsc-ink">{n(data.indexing.legacyPersonal)}</strong></div>
              <div><span className="block text-dtsc-muted">{t("Personnel · versionné", "Personal · versioned")}</span><strong className="text-lg text-dtsc-ink">{n(data.indexing.versionedPersonal)}</strong></div>
              <div><span className="block text-dtsc-muted">{t("Entreprise · historique", "Enterprise · legacy")}</span><strong className="text-lg text-dtsc-ink">{n(data.indexing.legacyEnterprise)}</strong></div>
              <div><span className="block text-dtsc-muted">{t("Entreprise · versionné", "Enterprise · versioned")}</span><strong className="text-lg text-dtsc-ink">{n(data.indexing.versionedEnterprise)}</strong></div>
            </div>}
        <p className="mt-2 text-xs text-dtsc-muted">{t("Plan de réindexation (lecture seule, sans exécution)", "Reindex plan (read-only, no execution)")}: {data.reindexPreview === null
          ? t("candidats non disponibles", "candidates unavailable")
          : `${n(data.reindexPreview.personalCandidates)} ${t("sources personnelles", "personal sources")} · ${n(data.reindexPreview.enterpriseCandidates)} ${t("sources entreprises", "enterprise sources")} · ${t("maximum", "at most")} ${data.reindexPreview.maxPerDomain} ${t("par domaine", "per domain")}`}</p>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Aucun document n'est modifié. Les réindexations réelles restent individuelles, autorisées et auditées via les espaces documentaires existants.", "No document is changed. Actual reindex operations remain individual, authorized and audited in existing document workspaces.")}</p>
      </article>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <article className="dtsc-card min-w-0 space-y-2 overflow-hidden p-4">
          <h4 className="font-bold text-dtsc-ink">{t("Échecs d'appels IA", "AI call failures")}</h4>
          <p className="text-xs text-dtsc-muted">{t("Appels échoués ou annulés", "Failed or cancelled calls")} · {t("10 premiers motifs", "Top 10 reasons")}</p>
          {data.modelFailures === null ? <p className="text-sm text-dtsc-muted">{t("Indisponible", "Unavailable")}</p> : data.modelFailures.length === 0 ? <p className="text-sm text-dtsc-muted">{t("Aucun événement enregistré sur la période", "No recorded event in window")}</p> : <div className="space-y-2">{data.modelFailures.map((r, i) => <div key={i} className="flex justify-between gap-2 border-b border-dtsc-border/50 py-2 text-xs"><span className="min-w-0 break-words">{r.status === "CANCELLED" ? t("Annulé", "Cancelled") : t("Échec", "Failed")} · {r.reasonCode}</span><strong className="tabular-nums">{n(r.calls)}</strong></div>)}</div>}
        </article>
        <article className="dtsc-card min-w-0 space-y-2 overflow-hidden p-4">
          <h4 className="font-bold text-dtsc-ink">{t("Refus d'outils IA", "AI tool denials")}</h4>
          <p className="text-xs text-dtsc-muted">{t("Actions refusées par les contrôles de sécurité", "Actions denied by security checks")} · {t("10 premiers motifs", "Top 10 reasons")}</p>
          {data.toolDenials === null ? <p className="text-sm text-dtsc-muted">{t("Indisponible", "Unavailable")}</p> : data.toolDenials.length === 0 ? <p className="text-sm text-dtsc-muted">{t("Aucun événement enregistré sur la période", "No recorded event in window")}</p> : <div className="space-y-2">{data.toolDenials.map((r, i) => <div key={i} className="flex justify-between gap-2 border-b border-dtsc-border/50 py-2 text-xs"><span className="min-w-0 break-words">{r.reasonCode}</span><strong className="tabular-nums">{n(r.executions)}</strong></div>)}</div>}
        </article>
      </div>
      <article className="dtsc-card min-w-0 space-y-2 p-4" aria-label={t("Métadonnées de récupération de connaissances", "Knowledge retrieval metadata")}>
        <h4 className="font-bold text-dtsc-ink">{t("Citations jointes aux réponses", "Citations attached to answers")}</h4>
        {data.citationAttachments === null ? (
          <p className="text-sm text-dtsc-muted">{t("Preuve de récupération indisponible", "Retrieval evidence unavailable")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-dtsc-muted">{t("Réponses avec sources jointes", "Answers with attached sources")}</dt><dd className="text-lg font-bold tabular-nums text-dtsc-ink">{n(data.citationAttachments.assistantMessagesWithCandidates)}</dd></div>
            <div><dt className="text-dtsc-muted">{t("Candidats de citation joints", "Attached citation candidates")}</dt><dd className="text-lg font-bold tabular-nums text-dtsc-ink">{n(data.citationAttachments.attachedCandidates)}</dd></div>
          </dl>
        )}
        <p className="text-xs text-dtsc-muted">{t("Ces chiffres proviennent des métadonnées réellement enregistrées avec les réponses de l’IA entreprise. Une source jointe ne prouve pas qu'elle a été citée dans la réponse. Aucun contenu, auteur ou nom d'entreprise n'est affiché.", "These counts use actual enterprise AI answer metadata. A source attached to an answer is not proof it was referenced in the generated text. No content, authors or organization names are shown.")}</p>
      </article>
      <article className="dtsc-card min-w-0 space-y-2 p-4" aria-label={t("Observations du cache contextuel", "Context cache observations")}>
        <h4 className="font-bold text-dtsc-ink">{t("Réutilisation du contexte IA (cache CAG)", "AI context reuse (CAG cache)")}</h4>
        {data.cag.status === "UNAVAILABLE" ? (
          <p className="text-xs text-dtsc-muted">{t("Mesure momentanément indisponible", "Measurement temporarily unavailable")}</p>
        ) : data.cag.status === "NO_OBSERVATIONS" ? (
          <p className="text-xs text-dtsc-muted">{t("Aucune observation de cache sur cette période", "No cache observations in this window")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="block text-dtsc-muted">{t("Réutilisations", "Hits")}</span><strong className="text-lg tabular-nums text-dtsc-ink">{n(data.cag.hits ?? 0)}</strong></div>
            <div><span className="block text-dtsc-muted">{t("Recalculs", "Misses")}</span><strong className="text-lg tabular-nums text-dtsc-ink">{n(data.cag.misses ?? 0)}</strong></div>
            <div><span className="block text-dtsc-muted">{t("Part réutilisée", "Hit share")}</span><strong className="text-lg tabular-nums text-dtsc-ink">{data.cag.cacheHitRate?.toLocaleString(en ? "en-US" : "fr-FR")}%</strong></div>
          </div>
        )}
        <p className="text-xs text-dtsc-muted">{t("Observations effectivement journalisées lors de la préparation de réponses. Le cache CAG est local à chaque instance et ces chiffres ne mesurent pas un cache global partagé ni le taux de succès des citations RAG.", "Observed request logs from response preparation. CAG is an instance-local cache; these counts do not measure a shared global cache or the success of RAG citations.")}</p>
      </article>
      <p className="text-xs text-dtsc-muted">{t("Preuve de citations effectivement utilisées : non instrumentée. Les alertes sont évaluées séparément selon les règles publiées. Aucun état sain n'est présumé.", "Proof of citations actually used: not instrumented. Alerts are evaluated separately from published rules. No healthy state is inferred.")}</p>
    </section>
  );
}
