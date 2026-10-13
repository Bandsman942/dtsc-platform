import type { ConsoleAiConfiguration } from "@/lib/console/console-ai-configuration";

export function ConsoleAiConfigurationPanel({ data, locale }: { data: ConsoleAiConfiguration; locale: "fr" | "en" }) {
  const en = locale === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const number = (value: number) => new Intl.NumberFormat(en ? "en-US" : "fr-FR").format(value);
  return (
    <section className="min-w-0 space-y-4" aria-label={t("Modèles et politiques IA", "AI models and policies")}>
      <div>
        <h3 className="text-xl font-black text-dtsc-ink">{t("Fournisseurs, modèles et budgets", "Providers, models and budgets")}</h3>
        <p className="mt-1 text-sm text-dtsc-muted">{t("Vue des sources de vérité actuellement appliquées. Aucune politique n'est modifiée depuis cette page.", "Current canonical policies. This view does not modify any policy.")}</p>
      </div>

      <div className="dtsc-card min-w-0 overflow-hidden p-4">
        <h4 className="text-base font-bold text-dtsc-ink">{t("Fournisseurs", "Providers")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Présence de clés uniquement : aucun identifiant secret n'est affiché.", "Only credential presence is shown; no secret is exposed.")}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-xs sm:text-sm">
            <thead className="text-dtsc-muted"><tr className="border-b border-dtsc-border"><th className="py-2">{t("Fournisseur", "Provider")}</th><th>{t("Statut de catalogue", "Catalog status")}</th><th>{t("Clé serveur", "Server key")}</th><th className="text-right">{t("Modèles", "Models")}</th></tr></thead>
            <tbody>{data.providers.map((p) => <tr key={p.code} className="border-b border-dtsc-border/60"><th scope="row" className="py-3 font-bold text-dtsc-ink">{p.code}</th><td>{p.status}</td><td>{p.credentialConfigured ? t("Configurée", "Configured") : t("Non configurée", "Not configured")}</td><td className="text-right">{number(p.modelCount)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="dtsc-card min-w-0 overflow-hidden p-4">
        <h4 className="text-base font-bold text-dtsc-ink">{t("Modèles certifiés et répertoriés", "Cataloged and certified models")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Être au catalogue ne garantit pas l'accès : permissions, abonnement, capacités et disponibilité sont revérifiés à l'exécution.", "Being cataloged does not grant access: permissions, plan, capabilities and availability are checked at runtime.")}</p>
        <div className="mt-3 max-h-[30rem] overflow-auto">
          <table className="w-full min-w-[35rem] text-left text-xs sm:text-sm">
            <thead className="sticky top-0 bg-dtsc-surface text-dtsc-muted"><tr className="border-b border-dtsc-border"><th className="py-2">{t("Modèle", "Model")}</th><th>{t("Fournisseur", "Provider")}</th><th>{t("Profils", "Profiles")}</th><th>{t("Statut", "Status")}</th><th>{t("Tarifs connus", "Priced")}</th></tr></thead>
            <tbody>{data.models.map((m) => <tr key={m.code} className="border-b border-dtsc-border/60"><th scope="row" className="max-w-[17rem] break-words py-3 font-semibold text-dtsc-ink">{m.code}</th><td>{m.providerCode}</td><td>{m.profileCodes.join(", ") || "—"}</td><td>{m.status}</td><td>{m.costKnown ? t("Oui", "Yes") : t("Inconnu", "Unknown")}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-dtsc-muted">{t("Source", "Source")}: getAiModelCatalog() · {t("métadonnées uniquement", "metadata only")}</p>
      </div>

      <div className="dtsc-card min-w-0 overflow-hidden p-4">
        <h4 className="text-base font-bold text-dtsc-ink">{t("Plafonds de sécurité du mode Agent", "Agent execution safety ceilings")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Plafonds techniques par niveau, distincts des droits commerciaux et des dépenses de facturation.", "Technical ceilings by capability tier, separate from plan entitlements and billed usage.")}</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-xs sm:text-sm"><thead className="text-dtsc-muted"><tr className="border-b border-dtsc-border"><th className="py-2">{t("Niveau", "Tier")}</th><th>{t("Étapes", "Steps")}</th><th>{t("Outils", "Tools")}</th><th>Tokens</th><th>{t("Budget USD", "Budget USD")}</th><th>{t("Durée max.", "Max duration")}</th></tr></thead><tbody>{data.agentBudgets.map((b) => <tr key={b.planCode} className="border-b border-dtsc-border/60"><th className="py-3 text-dtsc-ink">{en ? b.labelEn : b.labelFr}</th><td>{number(b.maxSteps)}</td><td>{number(b.maxToolCalls)}</td><td>{number(b.maxTokens)}</td><td>{b.maxEstimatedCost.toFixed(2)}</td><td>{number(b.maxDurationMs / 1000)} s</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-xs text-dtsc-muted">{t("Source", "Source")}: SERVER_LIMITS / resolveAiAgentBudget() · {t("le plan et les restrictions de données restent prioritaires", "plan and data policies still apply")}</p>
      </div>

      <div className="dtsc-card min-w-0 overflow-hidden p-4">
        <h4 className="text-base font-bold text-dtsc-ink">{t("Offres commerciales IA", "Commercial AI offers")}</h4>
        <p className="mt-1 text-xs text-dtsc-muted">{t("Les valeurs proviennent exclusivement des offres actives de facturation, sans duplication de prix ou quotas.", "Values are read from active BillingPlan offers, with no duplicate prices or quotas.")}</p>
        {data.commercialOffers === null
          ? <p className="mt-3 text-sm text-amber-600">{t("Offres indisponibles : données non vérifiées.", "Offers unavailable: data not verified.")}</p>
          : data.commercialOffers.length === 0
            ? <p className="mt-3 text-sm text-dtsc-muted">{t("Aucune offre active.", "No active offer.")}</p>
            : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-xs sm:text-sm"><thead className="text-dtsc-muted"><tr className="border-b border-dtsc-border"><th className="py-2">{t("Offre", "Offer")}</th><th>{t("Audience", "Audience")}</th><th>{t("Messages/jour", "Messages/day")}</th><th>{t("Tokens/jour", "Tokens/day")}</th></tr></thead><tbody>{data.commercialOffers.map((p, i) => <tr key={i} className="border-b border-dtsc-border/60"><th scope="row" className="py-3 text-dtsc-ink">{p.name}</th><td>{p.audience}</td><td>{number(p.dailyMessageLimit)}</td><td>{number(p.dailyTokenLimit)}</td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-dtsc-muted">{t("Source", "Source")}: BillingPlan · {t("limites par abonnement effectif résolues ailleurs", "effective subscription entitlements are resolved separately")}</p>
      </div>
    </section>
  );
}
