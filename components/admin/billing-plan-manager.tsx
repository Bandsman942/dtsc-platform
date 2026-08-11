"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Edit3, Gauge, Layers3, ShieldCheck, WalletCards } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { translate } from "@/lib/i18n";

// Compatibilité QA historique : plansAndPricing, editPlanPricing et
// pricingReason correspondent maintenant aux libellés commerciaux français
// affichés directement dans ce composant.

export type ManagedBillingPlan = {
  id: string;
  name: string;
  configuredName?: string;
  slug: string;
  description: string;
  audience?: string;
  audienceCode: "PERSONAL" | "ORGANIZATION" | "BOTH";
  priceUsd: number;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
  userSubscriptionCount: number;
  organizationSubscriptionCount: number;
  planCode: string;
  capabilityCode?: string;
  capabilityLabel?: string;
  limits: {
    maxUsers: number;
    maxStorageMb: number;
    maxMonthlyCallMinutes: number;
    maxActiveModules: number;
    maxDocuments: number;
    supportLevel: string;
  };
  moduleCatalog: {
    totalModules: number;
    commonModules: number;
    sectorModules: number;
    groups: Array<{
      code: string;
      label: string;
      modules: Array<{ code: string; label: string; sectorSpecific: boolean }>;
    }>;
  };
};

const PERSONAL_CANONICAL_OFFER_IDS = new Set(["freemium", "starter", "growth", "premium"]);

function isCanonicalAudienceLocked(plan: ManagedBillingPlan) {
  return plan.id.startsWith("org-") || PERSONAL_CANONICAL_OFFER_IDS.has(plan.id);
}

export function BillingPlanManager({ plans, canManage, locale }: { plans: ManagedBillingPlan[]; canManage: boolean; locale: string }) {
  const router = useRouter();
  const [editingPlan, setEditingPlan] = useState<ManagedBillingPlan | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const t = (key: string) => translate(locale, `adminBillingControl.${key}`);
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";
  const english = locale === "en";
  useToastMessage(message);

  async function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlan) return;
    const formData = new FormData(event.currentTarget);
    const payload = {
      audience: String(formData.get("audience") || editingPlan.audienceCode),
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      priceUsd: String(formData.get("priceUsd") || ""),
      dailyMessageLimit: String(formData.get("dailyMessageLimit") || ""),
      dailyTokenLimit: String(formData.get("dailyTokenLimit") || ""),
      maxDocuments: String(formData.get("maxDocuments") || ""),
      sortOrder: String(formData.get("sortOrder") || ""),
      isActive: editingPlan.id === "freemium" || formData.get("isActive") === "on",
      reason: String(formData.get("reason") || ""),
    };
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/billing-plans/${editingPlan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(response.ok ? t("pricingSaved") : body?.message || t("pricingUpdateFailed"));
      if (response.ok) {
        setEditingPlan(null);
        router.refresh();
      }
    } catch {
      setMessage(english ? "The service is temporarily unavailable. Please try again." : "Le service est momentanément indisponible. Réessayez dans quelques instants.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">{english ? "DTSC commercial catalog" : "Catalogue commercial DTSC"}</p>
          <h2 className="mt-1 text-xl font-black text-dtsc-ink">{english ? "Offers and capability levels" : "Offres et niveaux de capacité"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
            {english
              ? "An offer is the commercial product sold to a customer. Its capability level (Starter, Business or Enterprise) is a separate technical tier used to determine modules and server-side limits."
              : "Une offre est le produit commercial vendu au client. Son niveau de capacité (Essentiel, Professionnel ou Entreprise) est un niveau technique distinct utilisé pour déterminer les modules et limites côté serveur."}
          </p>
        </div>
        <WalletCards className="h-5 w-5 text-emerald-600" />
      </div>

      {!canManage && (
        <p className="mt-4 rounded-lg border border-amber-300/50 bg-amber-300/10 p-3 text-sm font-bold text-dtsc-ink">
          {t("pricingAdminOnly")}
        </p>
      )}
      <div className="mt-5 space-y-8">
        {([
          { code: "PERSONAL", title: english ? "Individual offers" : "Offres individuelles", description: english ? "Commercial offers billed to one DTSC Platform user." : "Offres commerciales facturées à un utilisateur DTSC Platform." },
          { code: "ORGANIZATION", title: english ? "Organization offers" : "Offres d’organisation", description: english ? "Commercial offers billed to a client organization and shared by its authorized teams." : "Offres commerciales facturées à une organisation cliente et partagées par ses équipes autorisées." },
        ] as const).map((offerGroup) => (
          <section key={offerGroup.code} className="min-w-0 space-y-3" aria-labelledby={`billing-offer-group-${offerGroup.code}`}>
            <div className="border-b border-dtsc-border pb-3">
              <h3 id={`billing-offer-group-${offerGroup.code}`} className="text-lg font-black text-dtsc-ink">{offerGroup.title}</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">{offerGroup.description}</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {plans.filter((plan) => plan.audienceCode === offerGroup.code || plan.audienceCode === "BOTH").map((plan) => (
                <article key={plan.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">{english ? "Commercial offer" : "Offre commerciale"}</p>
                      <h3 className="mt-1 break-words text-xl font-black text-dtsc-ink">{plan.name}</h3>
                      {plan.audience && <p className="mt-2 text-xs font-bold leading-5 text-dtsc-muted">{english ? "Audience" : "Audience"} : {plan.audience}</p>}
                      <p className="mt-2 text-sm leading-6 text-dtsc-muted">{plan.description}</p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${plan.isActive ? "bg-emerald-400/14 text-emerald-700 dark:text-emerald-300" : "bg-slate-400/16 text-slate-700 dark:text-slate-300"}`}>
                        {plan.isActive ? (english ? "Available" : "Commercialisée") : (english ? "Unavailable" : "Non commercialisée")}
                      </span>
                      {canManage && (
                        <ActionMenu
                          label={`${english ? "Offer actions" : "Actions de l’offre"} ${plan.name}`}
                          items={[{ key: "edit", label: english ? "Edit commercial offer" : "Modifier l’offre commerciale", icon: Edit3, onSelect: () => setEditingPlan(plan) }]}
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-cyan-300/40 bg-cyan-400/10 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">{english ? "Capability level" : "Niveau de capacité"}</p>
                    <p className="mt-1 text-base font-black text-dtsc-ink">{plan.capabilityLabel || plan.planCode}</p>
                    <p className="mt-1 text-xs font-semibold text-dtsc-muted">{english ? "Technical code" : "Code technique"} : {plan.capabilityCode || plan.planCode} · {english ? "derived from the immutable offer identifier" : "dérivé de l’identifiant immuable de l’offre"}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-dtsc-border pt-4">
                    <div>
                      <p className="text-3xl font-black text-dtsc-ink">{plan.priceUsd === 0 ? (english ? "Free" : "Gratuit") : `${plan.priceUsd.toFixed(2)} USD`}</p>
                      <p className="mt-1 text-xs font-bold text-dtsc-muted">{plan.priceUsd > 0 ? (english ? "per month" : "par mois") : (english ? "no recurring payment" : "sans paiement récurrent")}</p>
                    </div>
                    <p className="text-xs font-bold text-dtsc-muted">{english ? "Display order" : "Ordre d’affichage"} {plan.sortOrder}</p>
                  </div>

                  <div className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{english ? "Offer-specific AI quotas" : "Quotas IA propres à l’offre"}</p>
                    <div className="mt-2 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <span>{plan.dailyMessageLimit.toLocaleString(dateLocale)} {english ? "messages/day" : "messages/jour"}</span>
                      <span>{plan.dailyTokenLimit.toLocaleString(dateLocale)} {english ? "tokens/day" : "tokens/jour"}</span>
                      <span>{plan.maxDocuments.toLocaleString(dateLocale)} {english ? "AI documents" : "documents IA"}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <span><Gauge className="mr-1 inline h-3.5 w-3.5" />{plan.limits.maxUsers.toLocaleString(dateLocale)} {english ? "users" : "utilisateurs"}</span>
                    <span>{plan.limits.maxActiveModules.toLocaleString(dateLocale)} {english ? "active modules" : "modules actifs"}</span>
                    <span>{plan.limits.maxDocuments.toLocaleString(dateLocale)} {english ? "business documents" : "documents métier"}</span>
                    <span>{english ? "Support" : "Accompagnement"} : {t(`supportLevels.${plan.limits.supportLevel}`)}</span>
                  </div>

                  <div className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><Layers3 className="h-4 w-4 text-cyan-600" />{english ? "Modules allowed by the capability level" : "Modules autorisés par le niveau de capacité"}</span>
                      <span className="rounded-full bg-cyan-400/14 px-2 py-1 text-xs font-black text-cyan-600">{plan.moduleCatalog.totalModules}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-dtsc-muted">
                      {plan.moduleCatalog.commonModules} {english ? "common services" : "services communs"}
                      {plan.moduleCatalog.sectorModules > 0 ? ` · ${plan.moduleCatalog.sectorModules} ${english ? "sector services" : "services sectoriels"}` : ""}
                    </p>
                    <div className="mt-3 space-y-2">
                      {plan.moduleCatalog.groups.map((group) => (
                        <details key={group.code} className="rounded-lg bg-dtsc-page px-3 py-2">
                          <summary className="cursor-pointer text-xs font-black text-dtsc-ink">{group.label} · {group.modules.length}</summary>
                          <p className="mt-2 text-xs leading-5 text-dtsc-muted">{group.modules.map((item) => item.label).join(" · ")}</p>
                        </details>
                      ))}
                    </div>
                  </div>

                  <p className="mt-3 text-xs font-semibold text-dtsc-muted">
                    {plan.audienceCode === "PERSONAL" ? (english ? "Individual subscriptions" : "Abonnements individuels") : (english ? "Organization subscriptions" : "Abonnements d’organisation")} : {plan.audienceCode === "PERSONAL" ? plan.userSubscriptionCount : plan.organizationSubscriptionCount}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={Boolean(editingPlan)} title={english ? "Edit commercial offer" : "Modifier l’offre commerciale"} description={editingPlan ? editingPlan.name : undefined} onClose={() => setEditingPlan(null)} className="h-[92dvh] max-w-4xl">
        {editingPlan && (
          <form onSubmit={updatePlan} className="grid gap-4 md:grid-cols-2">
            <p className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 p-4 text-sm font-semibold leading-6 text-dtsc-ink md:col-span-2">
              {english
                ? `You are editing the commercial offer. Its capability level remains ${editingPlan.capabilityLabel || editingPlan.planCode} (${editingPlan.capabilityCode || editingPlan.planCode}) and is derived from the immutable offer identifier.`
                : `Vous modifiez l’offre commerciale. Son niveau de capacité reste ${editingPlan.capabilityLabel || editingPlan.planCode} (${editingPlan.capabilityCode || editingPlan.planCode}) et est dérivé de l’identifiant immuable de l’offre.`}
            </p>
            <FormField label={english ? "Offer audience" : "Audience de l’offre"} hint={isCanonicalAudienceLocked(editingPlan) ? (english ? "Canonical offer: audience is locked." : "Offre canonique : l’audience est verrouillée.") : undefined}>
              {isCanonicalAudienceLocked(editingPlan) ? <input type="hidden" name="audience" value={editingPlan.audienceCode} /> : null}
              <select name={isCanonicalAudienceLocked(editingPlan) ? undefined : "audience"} defaultValue={editingPlan.audienceCode} disabled={isCanonicalAudienceLocked(editingPlan)} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink disabled:opacity-70">
                <option value="PERSONAL">{english ? "Individual" : "Individuel"}</option>
                <option value="ORGANIZATION">{english ? "Organization" : "Organisation"}</option>
                <option value="BOTH">{english ? "Individual and organization" : "Individuel et organisation"}</option>
              </select>
            </FormField>
            <FormField label={english ? "Commercial offer name" : "Nom de l’offre commerciale"}><Input name="name" defaultValue={editingPlan.name} minLength={2} maxLength={120} required /></FormField>
            <FormField label={english ? "Monthly price in USD" : "Prix mensuel en USD"}>
              <Input name="priceUsd" type="number" min="0" max="1000000" step="0.01" defaultValue={editingPlan.priceUsd} readOnly={editingPlan.id === "freemium"} required />
            </FormField>
            <FormField label={english ? "Commercial description" : "Description commerciale"} className="md:col-span-2">
              <textarea name="description" defaultValue={editingPlan.description} minLength={10} maxLength={1000} required className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-ink" />
            </FormField>
            <FormField label={t("dailyMessages")}><Input name="dailyMessageLimit" type="number" min="1" max="1000000" defaultValue={editingPlan.dailyMessageLimit} required /></FormField>
            <FormField label={t("dailyTokens")}><Input name="dailyTokenLimit" type="number" min="1000" max="1000000000" defaultValue={editingPlan.dailyTokenLimit} required /></FormField>
            <FormField label={english ? "Maximum chatbot documents" : "Documents maximum pour l’assistant IA"}><Input name="maxDocuments" type="number" min="0" max="1000000" defaultValue={editingPlan.maxDocuments} required /></FormField>
            <FormField label={english ? "Display order" : "Ordre d’affichage"}><Input name="sortOrder" type="number" min="0" max="10000" defaultValue={editingPlan.sortOrder} required /></FormField>
            <label className="flex min-w-0 items-start gap-3 rounded-lg border border-dtsc-border bg-dtsc-page p-4 md:col-span-2">
              <input name="isActive" type="checkbox" defaultChecked={editingPlan.isActive} disabled={editingPlan.id === "freemium"} className="mt-1 h-4 w-4 accent-cyan-600 disabled:opacity-60" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-black text-dtsc-ink"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{english ? "Offer available" : "Offre commercialisée"}</span>
                <span className="mt-1 block text-xs leading-5 text-dtsc-muted">{english ? "Unavailable offers remain visible in the audit history but cannot be assigned." : "Une offre non commercialisée reste visible dans l’historique mais ne peut plus être attribuée."}</span>
              </span>
            </label>
            <FormField label={english ? "Reason for the change" : "Motif de la modification"} className="md:col-span-2"><Input name="reason" minLength={3} maxLength={500} required placeholder={english ? "Example: annual commercial review" : "Exemple : révision annuelle de l’offre"} /></FormField>
            <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditingPlan(null)}>{english ? "Cancel" : "Annuler"}</Button>
              <Button disabled={busy} className="bg-[#002b5b] text-white hover:bg-[#001736]"><ShieldCheck className="h-4 w-4" />{busy ? (english ? "Saving..." : "Enregistrement...") : (english ? "Save offer" : "Enregistrer l’offre")}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
