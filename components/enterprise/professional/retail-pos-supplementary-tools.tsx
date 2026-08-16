"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import { RetailDeviceReadiness } from "@/components/enterprise/professional/retail-device-readiness";
import { RetailGlobalReadiness } from "@/components/enterprise/professional/retail-global-readiness";
import { RetailOfflineContinuity } from "@/components/enterprise/professional/retail-offline-continuity";
import { RetailOmnichannelPanel } from "@/components/enterprise/professional/retail-omnichannel-panel";
import { RetailPaymentFollowup } from "@/components/enterprise/professional/retail-payment-followup";
import { translateRetailWorkspace } from "@/lib/i18n";

export function RetailPosSupplementaryTools({ organizationId }: { organizationId: string }) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const t = (key: Parameters<typeof translateRetailWorkspace>[1]) => translateRetailWorkspace(locale, key);

  return (
    <section aria-label={t("additionalShopTools")} className="space-y-3">
      <details className="group rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <span>{t("ordersPickupOffline")}</span>
          <span className="text-xs font-bold text-dtsc-muted group-open:hidden">{t("open")}</span>
          <span className="hidden text-xs font-bold text-dtsc-muted group-open:inline">{t("close")}</span>
        </summary>
        <div className="grid gap-4 border-t border-dtsc-border p-3 sm:p-4">
          <RetailOfflineContinuity organizationId={organizationId} locale={locale} />
          <RetailOmnichannelPanel organizationId={organizationId} locale={locale} />
        </div>
      </details>

      <RetailPaymentFollowup organizationId={organizationId} locale={locale} />

      <details className="group rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <span>{t("shopSetupEquipment")}</span>
          <span className="text-xs font-bold text-dtsc-muted group-open:hidden">{t("open")}</span>
          <span className="hidden text-xs font-bold text-dtsc-muted group-open:inline">{t("close")}</span>
        </summary>
        <div className="grid gap-4 border-t border-dtsc-border p-3 sm:p-4">
          <RetailDeviceReadiness organizationId={organizationId} locale={locale} />
          <RetailGlobalReadiness organizationId={organizationId} locale={locale} />
        </div>
      </details>
    </section>
  );
}
