"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Columns3, FileCheck2, History, LayoutList, Search, ShieldCheck } from "lucide-react";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { COMMERCIAL_MATURITY_LEVELS, canTransitionCommercialMaturity, type CommercialMaturity, type CommercialMaturityCard } from "@/lib/commercial-maturity-governance";
import { translate } from "@/lib/i18n";
import { getIteration05UserGuide } from "@/lib/user-guides/iteration05-guides";

const maturityKeys: Record<CommercialMaturity, { label: string; description: string }> = {
  BACKEND_READY: { label: "admin.commercialMaturity.backendReady", description: "admin.commercialMaturity.backendReadyDescription" },
  READ_ONLY_UI: { label: "admin.commercialMaturity.readOnlyUi", description: "admin.commercialMaturity.readOnlyUiDescription" },
  OPERATIONAL_UI: { label: "admin.commercialMaturity.operationalUi", description: "admin.commercialMaturity.operationalUiDescription" },
  PROFESSIONAL_READY: { label: "admin.commercialMaturity.professionalReady", description: "admin.commercialMaturity.professionalReadyDescription" },
  COMMERCIAL_READY: { label: "admin.commercialMaturity.commercialReady", description: "admin.commercialMaturity.commercialReadyDescription" },
};

const evidenceTypeKeys: Record<string, string> = {
  QA_PASSED: "admin.commercialMaturity.evidenceQaPassed",
  PRODUCTION_VERIFIED: "admin.commercialMaturity.evidenceProductionVerified",
  USER_GUIDE: "admin.commercialMaturity.evidenceUserGuide",
  OWNER_E2E: "admin.commercialMaturity.evidenceOwnerE2e",
  INCIDENT: "admin.commercialMaturity.evidenceIncident",
  DOCUMENTATION: "admin.commercialMaturity.evidenceDocumentation",
  OTHER: "admin.commercialMaturity.evidenceOther",
};

const errorKeys: Record<string, string> = {
  MATURITY_PERMISSION_REQUIRED: "admin.commercialMaturity.permissionRequired",
  COMMERCIAL_PROMOTION_PERMISSION_REQUIRED: "admin.commercialMaturity.promotionPermissionRequired",
  MATURITY_DEGRADATION_PERMISSION_REQUIRED: "admin.commercialMaturity.degradationPermissionRequired",
  PROFESSIONAL_EVIDENCE_REQUIRED: "admin.commercialMaturity.professionalEvidenceRequired",
  OWNER_VALIDATION_REQUIRED: "admin.commercialMaturity.ownerValidationRequired",
  INCIDENT_EVIDENCE_REQUIRED: "admin.commercialMaturity.incidentEvidenceRequired",
  TRANSITION_NOT_ALLOWED: "admin.commercialMaturity.transitionNotAllowed",
  MATURITY_CONFLICT: "admin.commercialMaturity.maturityConflict",
  TRANSITION_FAILED: "admin.commercialMaturity.transitionFailed",
};

const technicalStatusKeys: Record<string, string> = {
  ACTIVE: "admin.commercialMaturity.active",
  BETA: "admin.commercialMaturity.beta",
  PLANNED: "admin.commercialMaturity.planned",
  HIDDEN: "admin.commercialMaturity.hidden",
  RETIRED: "admin.commercialMaturity.retired",
  READ_ONLY: "admin.commercialMaturity.readOnly",
};

function maturityTone(maturity: CommercialMaturity): StatusBadgeTone {
  if (maturity === "COMMERCIAL_READY") return "success";
  if (maturity === "PROFESSIONAL_READY") return "info";
  if (maturity === "OPERATIONAL_UI") return "warning";
  if (maturity === "BACKEND_READY") return "neutral";
  return "danger";
}

function maturityLabel(locale: string | null | undefined, maturity: CommercialMaturity) {
  return translate(locale, maturityKeys[maturity].label);
}

function statusLabel(locale: string | null | undefined, value: string) {
  const key = technicalStatusKeys[value];
  return key ? translate(locale, key) : value;
}

function e2eLabel(locale: string | null | undefined, value: string) {
  if (value === "PASSED") return translate(locale, "admin.commercialMaturity.passed");
  if (value === "FAILED") return translate(locale, "admin.commercialMaturity.failed");
  return translate(locale, "admin.commercialMaturity.notExecuted");
}

function evidenceLabel(locale: string | null | undefined, value: string) {
  const key = evidenceTypeKeys[value];
  return key ? translate(locale, key) : value;
}

export function ErpCommercialReadinessDashboard({
  cards,
  locale = "fr",
  canManage = false,
  canPromoteCommercial = false,
  canDegrade = false,
}: {
  cards: CommercialMaturityCard[];
  locale?: string | null;
  canManage?: boolean;
  canPromoteCommercial?: boolean;
  canDegrade?: boolean;
}) {
  const router = useRouter();
  const t = (key: string) => translate(locale, key);
  const isEnglish = locale === "en";
  const dateLocale = isEnglish ? "en-US" : "fr-FR";
  const [view, setView] = useState<"MATRIX" | "KANBAN">("KANBAN");
  const [query, setQuery] = useState("");
  const [moduleType, setModuleType] = useState("");
  const [maturity, setMaturity] = useState("");
  const [domain, setDomain] = useState("");
  const [family, setFamily] = useState("");
  const [technicalStatus, setTechnicalStatus] = useState("");
  const [iteration, setIteration] = useState("");
  const [e2e, setE2e] = useState("");
  const [plan, setPlan] = useState("");
  const [guide, setGuide] = useState("");
  const [qa, setQa] = useState("");
  const [blocked, setBlocked] = useState("");
  const [selected, setSelected] = useState<CommercialMaturityCard | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const domains = useMemo(() => [...new Set(cards.map((card) => card.domain))].sort(), [cards]);
  const families = useMemo(() => [...new Set(cards.map((card) => card.family))].sort(), [cards]);
  const technicalStatuses = useMemo(() => [...new Set(cards.map((card) => card.technicalStatus))].sort(), [cards]);
  const iterations = useMemo(() => [...new Set(cards.map((card) => card.iteration).filter((value): value is string => Boolean(value)))].sort(), [cards]);
  const plans = useMemo(() => [...new Set(cards.map((card) => card.minimumPlan || "NO_PLAN"))].sort(), [cards]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale || "fr");
    return cards.filter((card) => {
      if (moduleType && card.moduleType !== moduleType) return false;
      if (maturity && card.maturity !== maturity) return false;
      if (domain && card.domain !== domain) return false;
      if (family && card.family !== family) return false;
      if (technicalStatus && card.technicalStatus !== technicalStatus) return false;
      if (iteration && card.iteration !== iteration) return false;
      if (e2e && card.e2eStatus !== e2e) return false;
      if (plan && (card.minimumPlan || "NO_PLAN") !== plan) return false;
      if (guide === "YES" && !card.guidePresent) return false;
      if (guide === "NO" && card.guidePresent) return false;
      if (qa === "YES" && !card.qaGreen) return false;
      if (qa === "NO" && card.qaGreen) return false;
      if (blocked === "YES" && !card.blocked) return false;
      if (blocked === "NO" && card.blocked) return false;
      if (!needle) return true;
      return [card.moduleCode, card.labelFr, card.labelEn, card.family, card.domain, card.commentFr, card.commentEn]
        .join(" ")
        .toLocaleLowerCase(locale || "fr")
        .includes(needle);
    });
  }, [blocked, cards, domain, e2e, family, guide, iteration, locale, maturity, moduleType, plan, qa, query, technicalStatus]);

  const professional = cards.filter((card) => card.maturity === "PROFESSIONAL_READY").length;
  const commercial = cards.filter((card) => card.maturity === "COMMERCIAL_READY").length;
  const withoutGuide = cards.filter((card) => !card.guidePresent).length;
  const waitingE2e = cards.filter((card) => card.maturity === "PROFESSIONAL_READY" && card.e2eStatus !== "PASSED").length;
  const progression = cards.length ? Math.round(cards.reduce((sum, card) => sum + card.progress, 0) / cards.length) : 0;

  function transitionTargets(card: CommercialMaturityCard) {
    if (!canManage) return [] as CommercialMaturity[];
    const currentIndex = COMMERCIAL_MATURITY_LEVELS.indexOf(card.maturity);
    return COMMERCIAL_MATURITY_LEVELS.filter((level) => {
      if (!canTransitionCommercialMaturity(card.maturity, level)) return false;
      const targetIndex = COMMERCIAL_MATURITY_LEVELS.indexOf(level);
      if (targetIndex < currentIndex && !canDegrade) return false;
      if (level === "COMMERCIAL_READY" && !canPromoteCommercial) return false;
      return true;
    });
  }

  function openTransition(card: CommercialMaturityCard) {
    if (!transitionTargets(card).length) {
      toastError(t("admin.commercialMaturity.noPermittedTransition"));
      return;
    }
    setSelected(card);
    setTransitionOpen(true);
  }

  async function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const ownerValidatedAt = String(form.get("ownerValidatedAt") || "");
    const response = await fetch("/api/admin/commercial-maturity/transitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleType: selected.moduleType,
        moduleCode: selected.moduleCode,
        toMaturity: String(form.get("toMaturity") || ""),
        reason: String(form.get("reason") || ""),
        evidence: {
          evidenceType: String(form.get("evidenceType") || "OTHER"),
          title: String(form.get("evidenceTitle") || ""),
          description: String(form.get("evidenceDescription") || ""),
          url: String(form.get("evidenceUrl") || ""),
          ownerValidated: form.get("ownerValidated") === "on",
        },
        iterationCode: String(form.get("iterationCode") || ""),
        pullRequestNumber: form.get("pullRequestNumber") ? Number(form.get("pullRequestNumber")) : undefined,
        commitSha: String(form.get("commitSha") || ""),
        productionDeploymentId: String(form.get("productionDeploymentId") || ""),
        e2eStatus: String(form.get("e2eStatus") || "NON_EXECUTED"),
        ownerValidatedAt: ownerValidatedAt ? new Date(ownerValidatedAt).toISOString() : "",
        idempotencyKey: `${selected.key}:${crypto.randomUUID()}`,
      }),
    });
    const body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      const reasonCode = String(body?.reasonCode || body?.error || "TRANSITION_FAILED");
      const baseMessage = t(errorKeys[reasonCode] || "admin.commercialMaturity.transitionRefused");
      const missing = Array.isArray(body?.missing)
        ? ` ${body.missing.map((item: string) => evidenceLabel(locale, item)).join(", ")}`
        : "";
      toastError(`${baseMessage}${missing}`);
      return;
    }
    toastSuccess(t("admin.commercialMaturity.transitionRecorded"));
    setTransitionOpen(false);
    router.refresh();
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={t("admin.commercialMaturity.eyebrow")}
        title={t("admin.commercialMaturity.title")}
        description={t("admin.commercialMaturity.description")}
        count={`${cards.length} ${t("admin.commercialMaturity.modulesAssessed")}`}
        secondaryActions={(
          <div className="flex flex-wrap items-center gap-2">
            <ContextualUserGuide guide={getIteration05UserGuide("COMMERCIAL_MATURITY_KANBAN", locale)} compact />
            <Link href="/admin" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-black text-dtsc-ink">
              {t("admin.commercialMaturity.backToConsole")}
            </Link>
          </div>
        )}
      />

      <ModuleMetrics label={t("admin.commercialMaturity.indicators")}>
        <ModuleMetric label={t("admin.commercialMaturity.professionallyReady")} value={professional} hint={t("admin.commercialMaturity.automatedEvidence")} />
        <ModuleMetric label={t("admin.commercialMaturity.commerciallyReady")} value={commercial} hint={t("admin.commercialMaturity.explicitOwnerApproval")} />
        <ModuleMetric label={t("admin.commercialMaturity.withoutGuide")} value={withoutGuide} hint={t("admin.commercialMaturity.nativeGuideRequired")} />
        <ModuleMetric label={t("admin.commercialMaturity.awaitingE2e")} value={waitingE2e} hint={`${progression}% ${t("admin.commercialMaturity.averageCriteria")}`} />
      </ModuleMetrics>

      <ModuleContent>
        <ModuleSection title={t("admin.commercialMaturity.viewsFilters")} description={t("admin.commercialMaturity.filtersDescription")}>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={view === "KANBAN" ? "default" : "outline"} onClick={() => setView("KANBAN")}><Columns3 className="h-4 w-4" />{t("admin.commercialMaturity.kanban")}</Button>
            <Button type="button" variant={view === "MATRIX" ? "default" : "outline"} onClick={() => setView("MATRIX")}><LayoutList className="h-4 w-4" />{t("admin.commercialMaturity.matrix")}</Button>
            <span className="ml-auto text-sm font-bold text-dtsc-muted">{visible.length} {t("admin.commercialMaturity.results")}</span>
          </div>
          <div className="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative min-w-0 xl:col-span-2">
              <span className="sr-only">{t("admin.commercialMaturity.search")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.commercialMaturity.search")} className="pl-10" />
            </label>
            <FilterSelect value={moduleType} onChange={setModuleType} label={t("admin.commercialMaturity.allModuleTypes")} options={[["STANDARD", t("admin.commercialMaturity.standard")], ["ERP", t("admin.commercialMaturity.erp")]]} />
            <FilterSelect value={maturity} onChange={setMaturity} label={t("admin.commercialMaturity.allMaturity")} options={COMMERCIAL_MATURITY_LEVELS.map((level) => [level, maturityLabel(locale, level)] as [string, string])} />
            <FilterSelect value={domain} onChange={setDomain} label={t("admin.commercialMaturity.allDomains")} options={domains.map((item) => [item, item] as [string, string])} />
            <FilterSelect value={family} onChange={setFamily} label={t("admin.commercialMaturity.allFamilies")} options={families.map((item) => [item, item] as [string, string])} />
            <FilterSelect value={technicalStatus} onChange={setTechnicalStatus} label={t("admin.commercialMaturity.allTechnicalStatuses")} options={technicalStatuses.map((item) => [item, statusLabel(locale, item)] as [string, string])} />
            <FilterSelect value={iteration} onChange={setIteration} label={t("admin.commercialMaturity.allIterations")} options={iterations.map((item) => [item, item] as [string, string])} />
            <FilterSelect value={e2e} onChange={setE2e} label={t("admin.commercialMaturity.e2eAll")} options={[["NON_EXECUTED", t("admin.commercialMaturity.notExecuted")], ["PASSED", t("admin.commercialMaturity.passed")], ["FAILED", t("admin.commercialMaturity.failed")]]} />
            <FilterSelect value={plan} onChange={setPlan} label={t("admin.commercialMaturity.allPlans")} options={plans.map((item) => [item, item === "NO_PLAN" ? t("admin.commercialMaturity.noPlanRestriction") : item] as [string, string])} />
            <FilterSelect value={guide} onChange={setGuide} label={t("admin.commercialMaturity.guideAll")} options={[["YES", t("admin.commercialMaturity.guidePresent")], ["NO", t("admin.commercialMaturity.guideMissing")]]} />
            <FilterSelect value={qa} onChange={setQa} label={t("admin.commercialMaturity.qaAll")} options={[["YES", t("admin.commercialMaturity.qaGreen")], ["NO", t("admin.commercialMaturity.qaPending")]]} />
            <FilterSelect value={blocked} onChange={setBlocked} label={t("admin.commercialMaturity.blockersAll")} options={[["YES", t("admin.commercialMaturity.blocked")], ["NO", t("admin.commercialMaturity.noBlocker")]]} />
          </div>
        </ModuleSection>

        {view === "KANBAN" ? (
          <ModuleSection title={t("admin.commercialMaturity.kanbanTitle")} description={t("admin.commercialMaturity.kanbanDescription")}>
            <div className="flex min-w-0 snap-x gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]" aria-label={t("admin.commercialMaturity.kanbanAria")}>
              {COMMERCIAL_MATURITY_LEVELS.map((level) => {
                const columnCards = visible.filter((card) => card.maturity === level);
                return (
                  <section key={level} className="w-[86vw] max-w-sm shrink-0 snap-start rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:w-80" aria-labelledby={`maturity-${level}`}>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h3 id={`maturity-${level}`} className="font-black text-dtsc-ink">{maturityLabel(locale, level)}</h3>
                        <p className="mt-1 text-xs leading-5 text-dtsc-muted">{t(maturityKeys[level].description)}</p>
                      </div>
                      <StatusBadge tone={maturityTone(level)}>{columnCards.length}</StatusBadge>
                    </div>
                    <div className="grid gap-3">
                      {columnCards.map((card) => (
                        <MaturityCard key={card.key} card={card} locale={locale} dateLocale={dateLocale} canTransition={transitionTargets(card).length > 0} onOpen={() => setSelected(card)} onTransition={() => openTransition(card)} />
                      ))}
                      {!columnCards.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-xs text-dtsc-muted">{t("admin.commercialMaturity.noModuleColumn")}</p> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </ModuleSection>
        ) : (
          <ModuleSection title={t("admin.commercialMaturity.matrixTitle")} description={t("admin.commercialMaturity.matrixDescription")}>
            <div className="overflow-x-auto rounded-2xl border border-dtsc-border">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-dtsc-page text-xs uppercase tracking-wide text-dtsc-muted">
                  <tr>
                    <th className="p-3">{t("admin.commercialMaturity.module")}</th><th className="p-3">{t("admin.commercialMaturity.type")}</th><th className="p-3">{t("admin.commercialMaturity.technical")}</th><th className="p-3">{t("admin.commercialMaturity.maturity")}</th><th className="p-3">{t("admin.commercialMaturity.guide")}</th><th className="p-3">{t("admin.commercialMaturity.qa")}</th><th className="p-3">{t("admin.commercialMaturity.e2e")}</th><th className="p-3">{t("admin.commercialMaturity.evidencePlural")}</th><th className="p-3">{t("admin.commercialMaturity.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((card) => (
                    <tr key={card.key} className="border-t border-dtsc-border">
                      <td className="p-3"><strong className="block text-dtsc-ink">{isEnglish ? card.labelEn : card.labelFr}</strong><span className="text-xs text-dtsc-muted">{card.moduleCode}</span></td>
                      <td className="p-3">{card.moduleType === "STANDARD" ? t("admin.commercialMaturity.standard") : t("admin.commercialMaturity.erp")}</td>
                      <td className="p-3">{statusLabel(locale, card.technicalStatus)}</td>
                      <td className="p-3"><StatusBadge tone={maturityTone(card.maturity)}>{maturityLabel(locale, card.maturity)}</StatusBadge></td>
                      <td className="p-3">{card.guidePresent ? "✓" : "—"}</td><td className="p-3">{card.qaGreen ? "✓" : "—"}</td><td className="p-3">{e2eLabel(locale, card.e2eStatus)}</td><td className="p-3">{card.evidenceCount}</td>
                      <td className="p-3"><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setSelected(card)}>{t("admin.commercialMaturity.details")}</Button><Button type="button" size="sm" disabled={!transitionTargets(card).length} onClick={() => openTransition(card)}>{t("admin.commercialMaturity.transition")}</Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModuleSection>
        )}
      </ModuleContent>

      <Dialog open={Boolean(selected) && !transitionOpen} onClose={() => setSelected(null)} title={selected ? (isEnglish ? selected.labelEn : selected.labelFr) : ""} description={selected?.moduleCode} className="max-w-4xl">
        {selected ? <ModuleDetail card={selected} locale={locale} dateLocale={dateLocale} canTransition={transitionTargets(selected).length > 0} onTransition={() => setTransitionOpen(true)} /> : null}
      </Dialog>

      <Dialog open={transitionOpen} onClose={() => { setTransitionOpen(false); setSelected(null); }} title={t("admin.commercialMaturity.transitionTitle")} description={selected ? `${selected.moduleType} · ${selected.moduleCode} · ${maturityLabel(locale, selected.maturity)}` : ""} className="max-w-3xl">
        {selected ? (
          <form onSubmit={submitTransition} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("admin.commercialMaturity.targetMaturity")}><select name="toMaturity" required className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3">{transitionTargets(selected).map((level) => <option key={level} value={level}>{maturityLabel(locale, level)}</option>)}</select></Field>
              <Field label={t("admin.commercialMaturity.evidenceType")}><select name="evidenceType" required className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3">{Object.keys(evidenceTypeKeys).map((type) => <option key={type} value={type}>{evidenceLabel(locale, type)}</option>)}</select></Field>
            </div>
            <Field label={t("admin.commercialMaturity.reason")}><textarea name="reason" required minLength={10} className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3" /></Field>
            <Field label={t("admin.commercialMaturity.evidenceTitle")}><Input name="evidenceTitle" required minLength={3} /></Field>
            <Field label={t("admin.commercialMaturity.evidenceDescription")}><textarea name="evidenceDescription" className="min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3" /></Field>
            <Field label={t("admin.commercialMaturity.evidenceUrl")}><Input name="evidenceUrl" type="url" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("admin.commercialMaturity.iteration")}><Input name="iterationCode" placeholder="STANDARD-05" /></Field>
              <Field label={t("admin.commercialMaturity.pullRequest")}><Input name="pullRequestNumber" type="number" min={1} /></Field>
              <Field label="SHA"><Input name="commitSha" /></Field>
              <Field label={t("admin.commercialMaturity.productionDeployment")}><Input name="productionDeploymentId" /></Field>
              <Field label={t("admin.commercialMaturity.e2e")}><select name="e2eStatus" className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3"><option value="NON_EXECUTED">{t("admin.commercialMaturity.notExecuted")}</option><option value="PASSED">{t("admin.commercialMaturity.passed")}</option><option value="FAILED">{t("admin.commercialMaturity.failed")}</option></select></Field>
              <Field label={t("admin.commercialMaturity.ownerValidationDate")}><Input name="ownerValidatedAt" type="datetime-local" /></Field>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"><input name="ownerValidated" type="checkbox" className="mt-1" /><span><strong className="block text-dtsc-ink">{t("admin.commercialMaturity.explicitOwnerValidation")}</strong><span className="text-dtsc-muted">{t("admin.commercialMaturity.ownerValidationHelp")}</span></span></label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTransitionOpen(false)}>{t("admin.commercialMaturity.cancel")}</Button><Button type="submit" disabled={submitting}>{submitting ? t("admin.commercialMaturity.recording") : t("admin.commercialMaturity.recordTransition")}</Button></div>
          </form>
        ) : null}
      </Dialog>
    </ModuleWorkspace>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return <label className="min-w-0"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"><option value="">{label}</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function MaturityCard({ card, locale, dateLocale, canTransition, onOpen, onTransition }: { card: CommercialMaturityCard; locale?: string | null; dateLocale: string; canTransition: boolean; onOpen: () => void; onTransition: () => void }) {
  const t = (key: string) => translate(locale, key);
  const label = locale === "en" ? card.labelEn : card.labelFr;
  return (
    <article className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-cyan-600">{card.moduleType} · {card.domain}</p><h4 className="mt-1 break-words text-sm font-black text-dtsc-ink">{label}</h4><p className="mt-1 break-all text-[0.68rem] font-semibold text-dtsc-muted">{card.moduleCode}</p></div>{card.blocked ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-dtsc-page"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${card.progress}%` }} /></div>
      <div className="mt-2 flex flex-wrap gap-1 text-[0.65rem] font-bold text-dtsc-muted"><span>{card.family}</span><span>· {statusLabel(locale, card.technicalStatus)}</span><span>· {card.iteration || t("admin.commercialMaturity.noIteration")}</span><span>· {card.progress}%</span><span>· {card.evidenceCount} {t("admin.commercialMaturity.evidenceCount")}</span>{card.responsible ? <span>· {t("admin.commercialMaturity.owner")} {card.responsible}</span> : null}<span>· {t("admin.commercialMaturity.guide")} {card.guidePresent ? "✓" : "—"}</span><span>· {t("admin.commercialMaturity.qa")} {card.qaGreen ? "✓" : "—"}</span><span>· {t("admin.commercialMaturity.e2e")} {e2eLabel(locale, card.e2eStatus)}</span></div>
      <p className="mt-2 text-[0.68rem] text-dtsc-muted">{card.lastEvolutionAt ? `${t("admin.commercialMaturity.lastChange")}: ${new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(card.lastEvolutionAt))}` : t("admin.commercialMaturity.noEvolutionDate")}</p>
      {card.blockers.length ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{card.blockers.join(" · ")}</p> : null}
      <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" className="flex-1" onClick={onOpen}>{t("admin.commercialMaturity.details")}</Button><Button type="button" size="sm" className="flex-1" disabled={!canTransition} onClick={onTransition}>{t("admin.commercialMaturity.move")}</Button></div>
    </article>
  );
}

function ModuleDetail({ card, locale, dateLocale, canTransition, onTransition }: { card: CommercialMaturityCard; locale?: string | null; dateLocale: string; canTransition: boolean; onTransition: () => void }) {
  const t = (key: string) => translate(locale, key);
  const repositoryUrl = "https://github.com/Bandsman942/dtsc-platform";
  return (
    <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
      <div className="grid gap-3 sm:grid-cols-3"><DetailMetric icon={<ShieldCheck className="h-4 w-4" />} label={t("admin.commercialMaturity.technicalStatus")} value={statusLabel(locale, card.technicalStatus)} /><DetailMetric icon={<FileCheck2 className="h-4 w-4" />} label={t("admin.commercialMaturity.criteria")} value={`${card.criteriaSatisfied.length}/${card.criteriaSatisfied.length + card.criteriaMissing.length}`} /><DetailMetric icon={<History className="h-4 w-4" />} label={t("admin.commercialMaturity.transitions")} value={String(card.history.length)} /></div>
      <section><h3 className="font-black text-dtsc-ink">{t("admin.commercialMaturity.dependencies")}</h3><div className="mt-2 flex flex-wrap gap-2">{card.dependencies.map((dependency) => <StatusBadge key={dependency}>{dependency}</StatusBadge>)}{!card.dependencies.length ? <p className="text-sm text-dtsc-muted">{t("admin.commercialMaturity.noDependency")}</p> : null}</div></section>
      <section><h3 className="font-black text-dtsc-ink">{t("admin.commercialMaturity.satisfiedCriteria")}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{card.criteriaSatisfied.map((item) => <p key={item} className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">✓ {item}</p>)}</div></section>
      <section><h3 className="font-black text-dtsc-ink">{t("admin.commercialMaturity.openCriteria")}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{card.criteriaMissing.map((item) => <p key={item} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">! {item}</p>)}{!card.criteriaMissing.length ? <p className="text-sm text-dtsc-muted">{t("admin.commercialMaturity.noOpenCriterion")}</p> : null}</div></section>
      <section><h3 className="font-black text-dtsc-ink">{t("admin.commercialMaturity.incidents")}</h3><div className="mt-2 grid gap-2">{card.incidents.map((incident) => <article key={incident.id} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm"><strong className="text-dtsc-ink">{incident.title}</strong>{incident.description ? <p className="mt-1 text-dtsc-muted">{incident.description}</p> : null}<p className="mt-2 text-xs text-dtsc-muted">{new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(incident.createdAt))}</p>{incident.url ? <a href={incident.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-black text-dtsc-blue underline">{t("admin.commercialMaturity.openEvidence")}</a> : null}</article>)}{!card.incidents.length ? <p className="text-sm text-dtsc-muted">{t("admin.commercialMaturity.noIncident")}</p> : null}</div></section>
      <section><h3 className="font-black text-dtsc-ink">{t("admin.commercialMaturity.history")}</h3><div className="mt-2 grid gap-2">{card.history.map((item) => <article key={item.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={maturityTone(item.toMaturity)}>{maturityLabel(locale, item.fromMaturity)} → {maturityLabel(locale, item.toMaturity)}</StatusBadge><span className="text-xs text-dtsc-muted">{new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span><span className="text-xs font-bold text-dtsc-muted">{item.actorName || item.actorId}</span></div><p className="mt-2 text-dtsc-muted">{item.reason}</p><div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-dtsc-muted">{item.pullRequestNumber ? <a href={`${repositoryUrl}/pull/${item.pullRequestNumber}`} target="_blank" rel="noreferrer" className="text-dtsc-blue underline">PR #{item.pullRequestNumber}</a> : <span>PR —</span>}{item.commitSha ? <a href={`${repositoryUrl}/commit/${item.commitSha}`} target="_blank" rel="noreferrer" className="text-dtsc-blue underline">SHA {item.commitSha.slice(0, 10)}</a> : <span>SHA —</span>}{item.productionDeploymentId?.startsWith("http") ? <a href={item.productionDeploymentId} target="_blank" rel="noreferrer" className="text-dtsc-blue underline">{t("admin.commercialMaturity.production")}</a> : <span>{t("admin.commercialMaturity.production")} {item.productionDeploymentId || "—"}</span>}<span>{t("admin.commercialMaturity.e2e")} {e2eLabel(locale, item.e2eStatus)}</span></div>{item.evidence.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{item.evidence.map((evidence) => <div key={evidence.id} className="rounded-lg border border-dtsc-border bg-dtsc-surface p-2 text-xs"><strong className="block text-dtsc-ink">{evidenceLabel(locale, evidence.evidenceType)}</strong>{evidence.url ? <a href={evidence.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-dtsc-blue underline">{evidence.title}</a> : <span className="mt-1 block text-dtsc-muted">{evidence.title}</span>}</div>)}</div> : null}</article>)}{!card.history.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-sm text-dtsc-muted">{t("admin.commercialMaturity.noHistory")}</p> : null}</div></section>
      <div className="flex flex-wrap justify-end gap-2">{card.routePath ? <Link href={card.routePath} className="inline-flex min-h-10 items-center rounded-xl border border-dtsc-border px-4 text-sm font-black text-dtsc-blue">{t("admin.commercialMaturity.openModule")}</Link> : null}<Button type="button" disabled={!canTransition} onClick={onTransition}>{t("admin.commercialMaturity.recordATransition")}</Button></div>
    </div>
  );
}

function DetailMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-dtsc-muted">{icon}{label}</p><p className="mt-2 break-words font-black text-dtsc-ink">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-bold text-dtsc-muted"><span>{label}</span>{children}</label>;
}
