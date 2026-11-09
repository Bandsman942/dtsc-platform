import Link from "next/link";
import {
  ArrowLeft, ArrowUpRight, BellRing, Building2, CreditCard, FileText, Globe2,
  MonitorSmartphone, PackageCheck, ReceiptText, ShieldCheck, ShoppingBasket, Tags,
  SlidersHorizontal, UsersRound, WifiOff,
  type LucideIcon,
} from "lucide-react";
import { ModuleHeader, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { translateRetailWorkspace, type RetailWorkspaceKey } from "@/lib/i18n";

export type RetailPosSectionId =
  | "checkout" | "customers" | "sites" | "staff" | "invoices" | "collections" | "offline"
  | "omnichannel" | "payments" | "equipment" | "readiness" | "activation"
  | "inventory" | "alerts" | "store-setup" | "my-stores";

type RetailPosSection = {
  id: RetailPosSectionId | "commercial";
  title: RetailWorkspaceKey;
  description: RetailWorkspaceKey;
  icon: LucideIcon;
  adminOnly?: boolean;
  requiredCapability?: string;
  hiddenInDirectory?: boolean;
  href?: string;
};

/** A single registry powers the directory, detail headers and role-aware navigation. */
export const RETAIL_POS_SECTIONS: readonly RetailPosSection[] = [
  { id: "checkout", title: "counterSale", description: "counterSaleDescription", icon: ShoppingBasket, requiredCapability: "PREPARE_INVOICE" },
  { id: "my-stores", title: "posNavMyStores", description: "posNavMyStoresDescription", icon: Building2 },
  { id: "store-setup", title: "posNavStoreSetup", description: "posNavStoreSetupDescription", icon: Building2, adminOnly: true },
  // Kept as an authenticated legacy deep link, but customer selection now lives in checkout.
  { id: "customers", title: "posNavCustomers", description: "posNavCustomersDescription", icon: UsersRound, requiredCapability: "PREPARE_INVOICE", hiddenInDirectory: true },
  { id: "sites", title: "posNavSites", description: "posNavSitesDescription", icon: Building2, adminOnly: true },
  { id: "staff", title: "posNavStaff", description: "posNavStaffDescription", icon: ShieldCheck, adminOnly: true },
  { id: "invoices", title: "posNavInvoices", description: "posNavInvoicesDescription", icon: ReceiptText, requiredCapability: "PREPARE_INVOICE" },
  { id: "collections", title: "posNavCollections", description: "posNavCollectionsDescription", icon: CreditCard, requiredCapability: "COLLECT_PAYMENT" },
  { id: "offline", title: "posNavOffline", description: "posNavOfflineDescription", icon: WifiOff, adminOnly: true },
  { id: "omnichannel", title: "posNavOmnichannel", description: "posNavOmnichannelDescription", icon: Globe2, adminOnly: true },
  { id: "payments", title: "posNavPayments", description: "posNavPaymentsDescription", icon: CreditCard, adminOnly: true },
  { id: "equipment", title: "posNavEquipment", description: "posNavEquipmentDescription", icon: MonitorSmartphone, adminOnly: true },
  { id: "readiness", title: "posNavReadiness", description: "posNavReadinessDescription", icon: FileText, adminOnly: true },
  { id: "activation", title: "retailActivationTitle", description: "retailActivationDescription", icon: SlidersHorizontal, adminOnly: true },
  { id: "inventory", title: "posNavInventory", description: "posNavInventoryDescription", icon: PackageCheck, adminOnly: true },
  { id: "alerts", title: "posNavAlerts", description: "posNavAlertsDescription", icon: BellRing, requiredCapability: "VIEW_STOCK" },
];

export function canOpenRetailPosSection(item: RetailPosSection, canManage: boolean, capabilities: ReadonlySet<string>) {
  if (canManage) return true;
  if (item.adminOnly) return false;
  return !item.requiredCapability || capabilities.has(item.requiredCapability);
}

export function getRetailPosSection(id: string | undefined, canManage: boolean, capabilities: ReadonlySet<string> = new Set()) {
  return RETAIL_POS_SECTIONS.find((item) => item.id === id && canOpenRetailPosSection(item, canManage, capabilities));
}

const POS_URL = "/enterprise-modules/RETAIL_POS";
const POS_DIRECTORY_SECTIONS: readonly RetailPosSection[] = [
  ...RETAIL_POS_SECTIONS,
  {
    id: "commercial", title: "posNavCommercial", description: "posNavCommercialDescription",
    icon: Tags, href: `${POS_URL}/commercial`, adminOnly: true,
  },
];

export function RetailPosSectionDirectory({ locale, canManage, capabilities }: { locale: "fr" | "en"; canManage: boolean; capabilities: ReadonlySet<string> }) {
  const t = (key: RetailWorkspaceKey) => translateRetailWorkspace(locale, key);
  return (
    <ModuleWorkspace density="compact" className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <div data-retail-pos-directory>
        <ModuleHeader eyebrow={t("shopOperations")} title={t("posNavTitle")} description={t("posNavDescription")} />
        <nav aria-label={t("posNavTitle")} className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {POS_DIRECTORY_SECTIONS.filter((item) => !item.hiddenInDirectory && canOpenRetailPosSection(item, canManage, capabilities)).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                data-retail-pos-card={item.id}
                href={item.href ?? `${POS_URL}?section=${item.id}`}
                className="group flex min-h-28 min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-left shadow-[0_6px_24px_rgba(0,23,54,0.045)] transition duration-150 hover:-translate-y-0.5 hover:border-cyan-500/60 hover:bg-dtsc-soft/55 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:translate-y-0"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-dtsc-blue dark:text-cyan-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-extrabold tracking-tight text-dtsc-ink sm:text-base">{t(item.title)}</span>
                  <span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{t(item.description)}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
      </div>
    </ModuleWorkspace>
  );
}

export function RetailPosSectionDetail({
  locale, section, children,
}: {
  locale: "fr" | "en";
  section: RetailPosSection;
  children: React.ReactNode;
}) {
  const t = (key: RetailWorkspaceKey) => translateRetailWorkspace(locale, key);
  const Icon = section.icon;
  return (
    <div data-retail-pos-detail={section.id} className="min-w-0 max-w-full space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <header className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface px-3 py-3 shadow-sm sm:px-5">
        <Link href={POS_URL} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" aria-label={t("posNavBack")}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-dtsc-blue dark:text-cyan-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="text-[0.65rem] font-bold uppercase tracking-wider text-dtsc-muted">{t("posNavTitle")}</p><h1 className="break-words text-lg font-black tracking-tight text-dtsc-ink">{t(section.title)}</h1></div>
        <span className="hidden items-center gap-1 text-xs font-semibold text-dtsc-muted sm:inline-flex">{t("posNavBackHint")}</span>
      </header>
      <div className="min-w-0 max-w-full">{children}</div>
    </div>
  );
}
