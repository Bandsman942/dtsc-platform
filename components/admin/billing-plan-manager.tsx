"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Edit3, Gauge, ShieldCheck, WalletCards } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { translate } from "@/lib/i18n";

export type ManagedBillingPlan = {
  id: string;
  name: string;
  slug: string;
  description: string;
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
  limits: {
    maxUsers: number;
    maxStorageMb: number;
    maxMonthlyCallMinutes: number;
    maxActiveModules: number;
    maxDocuments: number;
    supportLevel: string;
  };
};

export function BillingPlanManager({ plans, canManage, locale }: { plans: ManagedBillingPlan[]; canManage: boolean; locale: string }) {
  const router = useRouter();
  const [editingPlan, setEditingPlan] = useState<ManagedBillingPlan | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const t = (key: string) => translate(locale, `adminBillingControl.${key}`);
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";
  useToastMessage(message);

  async function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlan) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const payload = {
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
      setMessage(t("pricingServerUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">{t("planCatalog")}</p>
          <h2 className="mt-1 text-xl font-black text-dtsc-ink">{t("plansAndPricing")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
            {t("pricingDescription")}
          </p>
        </div>
        <WalletCards className="h-5 w-5 text-emerald-600" />
      </div>

      {!canManage && (
        <p className="mt-4 rounded-lg border border-amber-300/50 bg-amber-300/10 p-3 text-sm font-bold text-dtsc-ink">
          {t("pricingAdminOnly")}
        </p>
      )}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.id} className="min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">{plan.slug} · {plan.planCode}</p>
                <h3 className="mt-1 break-words text-lg font-black text-dtsc-ink">{plan.name}</h3>
                <p className="mt-2 text-sm leading-6 text-dtsc-muted">{plan.description}</p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-black ${plan.isActive ? "bg-emerald-400/14 text-emerald-700 dark:text-emerald-300" : "bg-slate-400/16 text-slate-700 dark:text-slate-300"}`}>
                  {plan.isActive ? t("planActive") : t("planInactive")}
                </span>
                {canManage && (
                  <ActionMenu
                    label={`${t("planActions")} ${plan.name}`}
                    items={[{ key: "edit", label: t("editPlanPricing"), icon: Edit3, onSelect: () => setEditingPlan(plan) }]}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-dtsc-border pt-4">
              <div>
                <p className="text-3xl font-black text-dtsc-ink">{plan.priceUsd === 0 ? t("free") : `${plan.priceUsd.toFixed(2)} USD`}</p>
                <p className="mt-1 text-xs font-bold text-dtsc-muted">{plan.priceUsd > 0 ? t("monthlyPeriod") : t("withoutPayment")}</p>
              </div>
              <p className="text-xs font-bold text-dtsc-muted">{t("orderUpdated").replace("{order}", String(plan.sortOrder)).replace("{date}", new Date(plan.updatedAt).toLocaleDateString(dateLocale))}</p>
            </div>

            <div className="mt-4 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2">
              <span><Gauge className="mr-1 inline h-3.5 w-3.5" />{t("messagesPerDay").replace("{count}", plan.dailyMessageLimit.toLocaleString(dateLocale))}</span>
              <span>{t("tokensPerDay").replace("{count}", plan.dailyTokenLimit.toLocaleString(dateLocale))}</span>
              <span>{t("chatbotDocuments").replace("{count}", plan.maxDocuments.toLocaleString(dateLocale))}</span>
              <span>{t("supportLevel").replace("{level}", t(`supportLevels.${plan.limits.supportLevel}`))}</span>
              <span>{t("userSubscriptions").replace("{count}", String(plan.userSubscriptionCount))}</span>
              <span>{t("organizationSubscriptions").replace("{count}", String(plan.organizationSubscriptionCount))}</span>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={Boolean(editingPlan)} title={t("editPlanPricing")} description={editingPlan ? `${editingPlan.name} · ${t("identifier")} ${editingPlan.id}` : undefined} onClose={() => setEditingPlan(null)} className="h-[92dvh] max-w-4xl">
        {editingPlan && (
          <form onSubmit={updatePlan} className="grid gap-4 md:grid-cols-2">
            <p className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 p-4 text-sm font-semibold leading-6 text-dtsc-ink md:col-span-2">
              {t("immutablePlanIdentifiers")}
            </p>
            <FormField label={t("commercialName")}><Input name="name" defaultValue={editingPlan.name} minLength={2} maxLength={120} required /></FormField>
            <FormField label={t("monthlyUsdPrice")} hint={editingPlan.id === "freemium" ? t("freePlanHint") : undefined}>
              <Input name="priceUsd" type="number" min="0" max="1000000" step="0.01" defaultValue={editingPlan.priceUsd} readOnly={editingPlan.id === "freemium"} required />
            </FormField>
            <FormField label={t("descriptionLabel")} className="md:col-span-2">
              <textarea name="description" defaultValue={editingPlan.description} minLength={10} maxLength={1000} required className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-ink" />
            </FormField>
            <FormField label={t("dailyMessages")}><Input name="dailyMessageLimit" type="number" min="1" max="1000000" defaultValue={editingPlan.dailyMessageLimit} required /></FormField>
            <FormField label={t("dailyTokens")}><Input name="dailyTokenLimit" type="number" min="1000" max="1000000000" defaultValue={editingPlan.dailyTokenLimit} required /></FormField>
            <FormField label={t("maxChatbotDocuments")}><Input name="maxDocuments" type="number" min="0" max="1000000" defaultValue={editingPlan.maxDocuments} required /></FormField>
            <FormField label={t("displayOrder")}><Input name="sortOrder" type="number" min="0" max="10000" defaultValue={editingPlan.sortOrder} required /></FormField>
            <label className="flex min-w-0 items-start gap-3 rounded-lg border border-dtsc-border bg-dtsc-page p-4 md:col-span-2">
              <input name="isActive" type="checkbox" defaultChecked={editingPlan.isActive} disabled={editingPlan.id === "freemium"} className="mt-1 h-4 w-4 accent-cyan-600 disabled:opacity-60" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-black text-dtsc-ink"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{t("activePlan")}</span>
                <span className="mt-1 block text-xs leading-5 text-dtsc-muted">{t("inactivePlanHint")}</span>
              </span>
            </label>
            <FormField label={t("pricingReason")} hint={t("pricingReasonHint")} className="md:col-span-2"><Input name="reason" minLength={3} maxLength={500} required placeholder={t("pricingReasonPlaceholder")} /></FormField>
            <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditingPlan(null)}>{t("cancelAction")}</Button>
              <Button disabled={busy} className="bg-[#002b5b] text-white hover:bg-[#001736]"><ShieldCheck className="h-4 w-4" />{busy ? t("saving") : t("savePlan")}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
