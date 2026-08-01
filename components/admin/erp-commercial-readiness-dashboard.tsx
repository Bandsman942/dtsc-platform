import Link from "next/link";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import {
  getCommercialMaturityLabel,
  type EnterpriseModuleCommercialAssessment,
  type EnterpriseModuleCommercialMaturity,
} from "@/lib/enterprise/module-commercial-readiness";

function maturityTone(maturity: EnterpriseModuleCommercialMaturity): StatusBadgeTone {
  if (maturity === "COMMERCIAL_READY") return "success";
  if (maturity === "PROFESSIONAL_READY") return "info";
  if (maturity === "OPERATIONAL_UI") return "warning";
  if (maturity === "BACKEND_READY") return "neutral";
  return "danger";
}

export function ErpCommercialReadinessDashboard({
  assessments,
  selectedMaturity,
  query,
}: {
  assessments: EnterpriseModuleCommercialAssessment[];
  selectedMaturity?: EnterpriseModuleCommercialMaturity;
  query?: string;
}) {
  const normalizedQuery = query?.trim().toLocaleLowerCase("fr") || "";
  const visible = assessments.filter((assessment) => {
    if (selectedMaturity && assessment.maturity !== selectedMaturity) return false;
    if (!normalizedQuery) return true;
    return [assessment.labelFr, assessment.moduleCode, assessment.commentFr]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(normalizedQuery);
  });
  const active = assessments.filter((assessment) => ["ACTIVE", "BETA"].includes(assessment.implementationStatus));
  const professional = assessments.filter((assessment) => assessment.maturity === "PROFESSIONAL_READY").length;
  const operational = assessments.filter((assessment) => assessment.maturity === "OPERATIONAL_UI").length;
  const commercial = assessments.filter((assessment) => assessment.commercializable).length;
  const gaps = assessments.reduce((sum, assessment) => sum + assessment.criteriaMissing.length, 0);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Administration DTSC"
        title="Maturité commerciale des modules ERP"
        description="Cette vue distingue le code disponible de l’expérience réellement professionnelle. Un module actif n’est pas automatiquement commercialisable."
        count={`${active.length} modules actifs évalués`}
        secondaryActions={
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-black text-dtsc-ink"
          >
            Retour à la console
          </Link>
        }
      />

      <ModuleMetrics label="Indicateurs de maturité ERP">
        <ModuleMetric label="Modules actifs" value={active.length} hint="Statut technique actif ou bêta" />
        <ModuleMetric label="Interfaces opérationnelles" value={operational} hint="Flux principaux disponibles" />
        <ModuleMetric label="Prêts professionnellement" value={professional} hint="Validation produit encore distincte" />
        <ModuleMetric label="Commercialisables" value={commercial} hint={`${gaps} critères restent ouverts`} />
      </ModuleMetrics>

      <ModuleToolbar
        search={
          <form method="get" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="min-w-0">
              <span className="sr-only">Rechercher un module</span>
              <input
                name="q"
                defaultValue={query}
                placeholder="Rechercher par nom ou code…"
                className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink outline-none focus:border-cyan-400"
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">Filtrer par maturité</span>
              <select
                name="maturity"
                defaultValue={selectedMaturity || ""}
                className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink sm:w-auto"
              >
                <option value="">Toutes les maturités</option>
                <option value="BACKEND_READY">Backend prêt</option>
                <option value="READ_ONLY_UI">Interface de consultation</option>
                <option value="OPERATIONAL_UI">Interface opérationnelle</option>
                <option value="PROFESSIONAL_READY">Prêt professionnellement</option>
                <option value="COMMERCIAL_READY">Prêt à commercialiser</option>
              </select>
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white sm:col-span-2 sm:justify-self-end"
            >
              Appliquer les filtres
            </button>
          </form>
        }
        summary={`${visible.length} résultat${visible.length > 1 ? "s" : ""}`}
      />

      <ModuleContent>
        <ModuleSection
          title="Matrice de commercialisation"
          description="Les lacunes sont affichées comme des critères produit à fermer, pas comme des erreurs techniques à masquer."
          count={visible.length}
        >
          {visible.length ? (
            <BusinessList ariaLabel="Maturité des modules ERP">
              {visible.map((assessment) => (
                <BusinessListItem
                  key={assessment.moduleCode}
                  title={assessment.labelFr}
                  status={
                    <StatusBadge tone={maturityTone(assessment.maturity)}>
                      {getCommercialMaturityLabel(assessment.maturity, "fr")}
                    </StatusBadge>
                  }
                  meta={
                    <span className="flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1">
                      <span className="[overflow-wrap:anywhere]">Code : {assessment.moduleCode}</span>
                      <span>Offre minimale : {assessment.minimumPlan}</span>
                      <span>Audit : {assessment.evaluatedAt}</span>
                    </span>
                  }
                  description={assessment.commentFr}
                  actions={
                    assessment.routePath && assessment.routeKind !== "ADMIN_SECTION" ? (
                      <Link
                        href={assessment.routePath}
                        className="inline-flex min-h-10 items-center rounded-lg border border-dtsc-border px-3 py-2 text-xs font-black text-dtsc-blue"
                      >
                        Ouvrir
                      </Link>
                    ) : null
                  }
                />
              ))}
            </BusinessList>
          ) : (
            <div className="border-y border-dtsc-border py-10 text-center text-sm text-dtsc-muted">
              Aucun module ne correspond à ces filtres.
            </div>
          )}
        </ModuleSection>

        <ModuleSection
          title="Lecture des niveaux"
          description="La maturité commerciale est indépendante du statut technique et ne peut être promue que par des preuves vérifiables."
        >
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            {([
              ["Backend prêt", "Les modèles et services existent, mais l’interface utilisateur reste insuffisante."],
              ["Interface de consultation", "Les données sont visibles, sans opérations principales complètes dans l’interface."],
              ["Interface opérationnelle", "Les flux principaux fonctionnent ; des lacunes UX, linguistiques ou documentaires subsistent."],
              ["Prêt professionnellement", "Le standard fonctionnel et UX est atteint ; la validation commerciale finale reste distincte."],
              ["Prêt à commercialiser", "Tous les critères sont prouvés, testés et compatibles avec l’offre commerciale correspondante."],
            ] as const).map(([title, description]) => (
              <article key={title} className="min-w-0 border-l-2 border-cyan-400 px-4 py-2">
                <h3 className="font-black text-dtsc-ink">{title}</h3>
                <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">{description}</p>
              </article>
            ))}
          </div>
        </ModuleSection>
      </ModuleContent>
    </ModuleWorkspace>
  );
}
