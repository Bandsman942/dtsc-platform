import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Building2, CheckCircle2, CircleAlert, CreditCard, Package, ShieldCheck, UsersRound, BookOpenCheck, ShoppingBasket, ClipboardCheck, Banknote, ListChecks } from "lucide-react";
import { getRetailMultiStoreOnboarding, getRetailMyStores } from "@/lib/enterprise/retail/multi-store-onboarding";
import { RetailGuidedStoreSetup } from "@/components/enterprise/professional/retail-guided-store-setup";

const POS = "/enterprise-modules/RETAIL_POS";
const setupCopy = {
  fr: {
    heading: "Configurer mes boutiques", intro: "Un seul abonnement entreprise, plusieurs boutiques autonomes. Configurez chaque point de vente avec les référentiels ERP existants, puis donnez accès à son équipe.",
    empty: "Aucune boutique créée. Commencez par ajouter un site de type boutique dans Sites et entrepôts.",
    create: "Créer une boutique", ready: "Prête pour le personnel", incomplete: "Configuration à terminer", previous: "Toutes les boutiques",
    warehouse: "Dépôt de stock", account: "Caisse en devise principale", staff: "Personnel affecté", isolation: "Isolation des boutiques",
    warehouseHelp: "Créez au moins un entrepôt actif relié à cette boutique.", accountHelp: "Créez un compte de caisse actif lié à cette boutique, dans la devise principale.",
    staffHelp: "Invitez les employés dans l’entreprise, puis attribuez au moins un accès ventes, un accès facturation et un accès encaissement à cette boutique.",
    isolationHelp: "Activez l’isolation après avoir vérifié les affectations de chaque collaborateur.",
    warehouseAction: "Gérer les entrepôts", accountAction: "Gérer les caisses", staffAction: "Affecter le personnel", isolationAction: "Activer les accès isolés",
    finalAction: "Contrôler la préparation globale", selected: "Boutique sélectionnée", completed: "Étapes terminées", choose: "Ouvrir la configuration", finished: "Configuration de cette boutique complète.",
    note: "Les boutiques, caisses, stocks et collaborateurs sont conservés dans leurs modules ERP de référence. Aucun doublon n’est créé.",
    operational: "Prête à vendre", structural: "Préparation initiale", finance: "Finance et comptabilité", catalog: "Catalogue actif", stock: "Stock approvisionné", checkout: "Facturation activée", stockOptional: "Le stock physique n’est exigé ici que lorsque le catalogue comporte des articles suivis en stock.", openTills: "Caisses ouvertes", operationalHelp: "Ces vérifications sont indicatives ; l’autorisation réelle reste contrôlée par les API et l’activation sécurisée.",
  },
  en: {
    heading: "Set up my stores", intro: "One company subscription, multiple independent stores. Configure each point of sale using your existing ERP records, then assign the team.",
    empty: "No store created yet. Start by adding a store-type site under Sites and warehouses.",
    create: "Create a store", ready: "Ready for staff", incomplete: "Setup incomplete", previous: "All stores",
    warehouse: "Stock warehouse", account: "Cash account in base currency", staff: "Assigned staff", isolation: "Store isolation",
    warehouseHelp: "Create at least one active warehouse linked to this store.", accountHelp: "Create an active cash account linked to this store in the base currency.",
    staffHelp: "Invite employees, then grant at least one sales, invoicing and payment capability for this store.",
    isolationHelp: "Enable isolation once each staff member's assignments have been verified.",
    warehouseAction: "Manage warehouses", accountAction: "Manage cash accounts", staffAction: "Assign staff", isolationAction: "Enable isolated access",
    finalAction: "Review overall readiness", selected: "Selected store", completed: "Steps complete", choose: "Open setup", finished: "This store is fully configured.",
    note: "Stores, accounts, stock and employees remain in their canonical ERP modules. No duplicate records are created.",
    operational: "Ready to sell", structural: "Initial setup", finance: "Finance and accounting", catalog: "Active catalogue", stock: "Inventory loaded", checkout: "Invoice checkout active", stockOptional: "Physical inventory is required here only when your catalogue contains tracked items.", openTills: "Open tills", operationalHelp: "These checks are advisory; actual permissions are enforced by the APIs and secure activation.",
  },
} as const;

export async function RetailMultiStoreOnboarding({ organizationId, locale, selectedSiteId }: { organizationId: string; locale: "fr" | "en"; selectedSiteId?: string }) {
  const copy = setupCopy[locale];
  const onboarding = await getRetailMultiStoreOnboarding(organizationId);
  const selected = onboarding.sites.find((site) => site.id === selectedSiteId);
  return <section data-retail-multistore-onboarding className="space-y-4">
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3"><Building2 aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-cyan-600" /><div className="min-w-0"><h2 className="text-xl font-black tracking-tight text-dtsc-ink">{copy.heading}</h2><p className="mt-2 text-sm leading-6 text-dtsc-muted">{copy.intro}</p></div></div>
      <p className="mt-4 rounded-xl border border-dtsc-border bg-dtsc-soft/45 p-3 text-xs leading-5 text-dtsc-muted">{copy.note}</p>
    </div>
    <RetailGuidedStoreSetup organizationId={organizationId} locale={locale} baseCurrency={onboarding.baseCurrency} selectedSite={selected || null} sites={onboarding.sites} />
    {!onboarding.sites.length ? <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-surface p-5"><p className="text-sm text-dtsc-muted">{copy.empty}</p><Link className="mt-4 inline-flex rounded-xl bg-dtsc-blue px-4 py-3 text-sm font-bold text-white" href="/enterprise-modules/SITES_WAREHOUSES#sites">{copy.create}</Link></div> : null}
    {selected ? <>
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-blue" href={`${POS}?section=store-setup`}><ArrowLeft aria-hidden="true" className="h-4 w-4" />{copy.previous}</Link>
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-6"><p className="text-xs font-bold uppercase tracking-wider text-cyan-600">{copy.selected}</p><h3 className="mt-2 break-words text-xl font-black text-dtsc-ink">{selected.name}</h3><p className="mt-1 text-sm text-dtsc-muted">{selected.code}{selected.city ? ` · ${selected.city}` : ""} · {selected.siteType}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { id: "warehouse", title: copy.warehouse, info: copy.warehouseHelp, complete: selected.warehouseCount > 0, count: selected.warehouseCount, href: "/enterprise-modules/SITES_WAREHOUSES#warehouses", action: copy.warehouseAction, Icon: Package },
          { id: "cash", title: copy.account, info: copy.accountHelp, complete: selected.cashReady, count: selected.cashAccountCount, href: "/enterprise-modules/FINANCE_TREASURY#cash-accounts", action: copy.accountAction, Icon: CreditCard },
          { id: "staff", title: copy.staff, info: `${copy.staffHelp} (${selected.staffCount} / ${selected.invoicerCount} / ${selected.cashierCount})`, complete: selected.staffCount > 0 && selected.invoicerCount > 0 && selected.cashierCount > 0, count: selected.staffCount, href: `${POS}?section=staff`, action: copy.staffAction, Icon: UsersRound },
          { id: "isolation", title: copy.isolation, info: copy.isolationHelp, complete: onboarding.isolationEnabled, count: null, href: `${POS}?section=activation`, action: copy.isolationAction, Icon: ShieldCheck },
        ] as const).map((step) => <article key={step.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm">
          <div className="flex items-center gap-3"><step.Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-dtsc-blue" /><h4 className="min-w-0 flex-1 font-black text-dtsc-ink">{step.title}</h4>{step.complete ? <CheckCircle2 aria-label="OK" className="h-5 w-5 shrink-0 text-emerald-600" /> : <CircleAlert aria-label="Pending" className="h-5 w-5 shrink-0 text-amber-500" />}</div>
          {step.count !== null ? <p className="mt-2 text-lg font-extrabold text-dtsc-ink">{step.count}</p> : null}<p className="mt-2 text-sm leading-6 text-dtsc-muted">{step.info}</p>
          <Link href={step.href} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-blue hover:bg-dtsc-soft focus-visible:ring-2 focus-visible:ring-cyan-400">{step.action}<ArrowUpRight className="h-4 w-4" /></Link>
        </article>)}
      </div>
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5" data-retail-store-operational-readiness>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-black text-dtsc-ink">{copy.operational}</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${selected.operationalReady ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{Object.values(selected.readiness).filter(Boolean).length}/8</span></div>
        <p className="mt-2 text-sm text-dtsc-muted">{copy.operationalHelp}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {([
            { label: copy.warehouse, ok: selected.readiness.warehouse, href: "/enterprise-modules/SITES_WAREHOUSES#warehouses", Icon: Package },
            { label: copy.account, ok: selected.readiness.cash, href: "/enterprise-modules/FINANCE_TREASURY#cash-accounts", Icon: CreditCard },
            { label: copy.staff, ok: selected.readiness.team, href: `${POS}?section=staff`, Icon: UsersRound },
            { label: copy.isolation, ok: selected.readiness.isolation, href: `${POS}?section=activation`, Icon: ShieldCheck },
            { label: copy.finance, ok: selected.readiness.finance, href: "/enterprise-modules/FINANCE_ACCOUNTING#accounting-readiness", Icon: BookOpenCheck },
            { label: copy.catalog, ok: selected.readiness.catalog, href: "/enterprise-modules/CATALOG#catalog-items", Icon: ShoppingBasket },
            { label: copy.stock, ok: selected.readiness.stock, href: "/enterprise-modules/INVENTORY_LOGISTICS#inventory-items", Icon: Package },
            { label: copy.checkout, ok: selected.readiness.checkout, href: `${POS}?section=activation`, Icon: ClipboardCheck },
          ] as const).map(({ label, ok, href, Icon }) => <Link key={label} href={href} className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-semibold text-dtsc-ink hover:bg-dtsc-soft focus-visible:ring-2 focus-visible:ring-cyan-400"><Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-dtsc-blue" />{label}{ok ? <CheckCircle2 aria-label="OK" className="ml-auto h-4 w-4 text-emerald-600" /> : <CircleAlert aria-label="Pending" className="ml-auto h-4 w-4 text-amber-600" />}</Link>)}
        </div>
        <p className="mt-3 text-xs text-dtsc-muted">{copy.stockOptional} · {copy.openTills} : {selected.openTillCount} · {copy.stock} : {selected.stockLineCount}</p>
      </div>
      <Link href={`${POS}?section=readiness`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm font-bold text-dtsc-blue">{copy.finalAction}</Link>
    </> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{onboarding.sites.map((site) => {
      const complete = Object.values(site.readiness).filter(Boolean).length;
      return <Link key={site.id} href={`${POS}?section=store-setup&siteId=${encodeURIComponent(site.id)}`} className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm transition hover:border-cyan-500/60 hover:bg-dtsc-soft/45 focus-visible:ring-2 focus-visible:ring-cyan-400">
        <div className="flex items-start gap-3"><Building2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-dtsc-blue" /><div className="min-w-0 flex-1"><h3 className="break-words font-black text-dtsc-ink">{site.name}</h3><p className="text-xs text-dtsc-muted">{site.code} · {site.siteType}</p></div><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-dtsc-blue" /></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-xs font-bold ${site.operationalReady ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{site.operationalReady ? copy.operational : site.ready ? copy.structural : copy.incomplete}</span><span className="text-xs font-bold text-dtsc-muted">{complete}/8 · {copy.completed}</span></div>
        <span className="text-sm font-bold text-dtsc-blue">{copy.choose}</span>
      </Link>;
    })}</div>}
    {!selected && onboarding.sites.length ? <Link href="/enterprise-modules/SITES_WAREHOUSES#sites" className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm font-bold text-dtsc-blue">{copy.create}</Link> : null}
  </section>;
}

const myCopy = {
  fr: { title: "Mes boutiques", intro: "Votre poste de travail : choisissez votre boutique et retrouvez vos opérations autorisées.", role: "Profil d'accès boutique", position: "Poste officiel", noPosition: "Non renseigné", roles: { MANAGER: "Gérant", INVOICER: "Facturier", CASHIER: "Caissier", OWNER: "Administrateur" }, checkout: "Vente au comptoir", invoices: "Registre des factures", collections: "Encaissements", noAccess: "Aucune boutique ne vous est affectée. Demandez à l’administrateur de vous attribuer des accès par boutique.", legacy: "Le paramétrage général de l’isolation n’est pas encore activé. Vos affectations existantes limitent néanmoins vos opérations de boutique.", setup: "Configurer les boutiques", tills: "Caisses de ma boutique", noTill: "Aucune caisse n’est encore configurée pour cette boutique.", close: "Clôture journalière", start: "Par quoi commencer ?", steps: "Le facturier prépare la facture et le caissier l’encaisse dans son espace distinct. Avant d’encaisser, ouvrez votre session de caisse.", canClose: "Vous êtes autorisé à préparer la clôture, soumise ensuite à une validation indépendante." },
  en: { title: "My stores", intro: "Choose an assigned store and review your authorized operations.", role: "Store access profile", position: "Official position", noPosition: "Not assigned", roles: { MANAGER: "Manager", INVOICER: "Invoicing clerk", CASHIER: "Cashier", OWNER: "Administrator" }, checkout: "Counter sale", invoices: "Invoice register", collections: "Collections", noAccess: "No store is assigned to you yet. Ask an administrator to grant store-specific access.", legacy: "Company-wide isolation has not yet been activated. Existing store assignments still restrict your store operations.", setup: "Set up stores", tills: "My store tills", noTill: "No till is configured for this store yet.", close: "Daily close", start: "Where to start?", steps: "The invoicer prepares the invoice; the cashier collects it in a separate workspace. Open a cash session before collecting.", canClose: "You may prepare a close, which then requires independent approval." },
} as const;

export async function RetailMyStores({ organizationId, userId, role, locale }: { organizationId: string; userId: string; role: string; locale: "fr" | "en" }) {
  const copy = myCopy[locale];
  const { sites, isolationEnabled, isOwner, officialPosition } = await getRetailMyStores(organizationId, userId, role);
  return <section data-retail-my-stores className="space-y-4">
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-6"><h2 className="text-xl font-black text-dtsc-ink">{copy.title}</h2><p className="mt-2 text-sm text-dtsc-muted">{copy.intro}</p><p className="mt-2 text-sm font-bold text-dtsc-ink">{copy.position} : {officialPosition[locale] || copy.noPosition}</p></div>
    {!isolationEnabled ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">{copy.legacy}</p> : null}
    {!sites.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-surface p-5 text-sm text-dtsc-muted">{copy.noAccess}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sites.map((site) => <article key={site.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm">
      <div className="flex items-center gap-3"><Building2 className="h-5 w-5 shrink-0 text-dtsc-blue" aria-hidden="true" /><div className="min-w-0"><h3 className="break-words text-base font-black text-dtsc-ink">{site.name}</h3><p className="text-xs text-dtsc-muted">{site.code}{site.city ? ` · ${site.city}` : ""}</p></div></div>
      <p className="mt-3 text-xs font-semibold text-dtsc-muted">{copy.role} : {copy.roles[site.roleCode as keyof typeof copy.roles] || site.roleCode}</p>
      {site.capabilities.includes("COLLECT_PAYMENT") || site.capabilities.includes("CLOSE_CASH") ? <div className="mt-3 rounded-xl bg-dtsc-soft/50 p-3"><p className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><Banknote aria-hidden="true" className="h-4 w-4" />{copy.tills}</p>{site.tills.length ? <ul className="mt-2 space-y-1 text-xs text-dtsc-muted">{site.tills.map((till, index) => <li key={`${till.name}-${index}`}>{till.name} · {till.currencyCode}</li>)}</ul> : <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{copy.noTill}</p>}</div> : null}
      <div className="mt-3"><p className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><ListChecks aria-hidden="true" className="h-4 w-4" />{copy.start}</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">{copy.steps}</p>{site.capabilities.includes("CLOSE_CASH") ? <p className="mt-2 text-xs font-semibold text-dtsc-blue">{copy.canClose}</p> : null}</div>
      <div className="mt-4 flex flex-wrap gap-2">{site.capabilities.includes("PREPARE_INVOICE") ? <Link href={`${POS}?section=checkout&siteId=${encodeURIComponent(site.id)}`} className="inline-flex min-h-11 items-center rounded-xl bg-dtsc-blue px-3 text-sm font-bold text-white">{copy.checkout}</Link> : null}{site.capabilities.includes("PREPARE_INVOICE") ? <Link href={`${POS}?section=invoices&siteId=${encodeURIComponent(site.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue">{copy.invoices}</Link> : null}{site.capabilities.includes("COLLECT_PAYMENT") ? <Link href={`${POS}?section=collections&siteId=${encodeURIComponent(site.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue">{copy.collections}</Link> : null}{site.capabilities.includes("CLOSE_CASH") ? <Link href={`/enterprise-modules/RETAIL_DAILY_CLOSE?siteId=${encodeURIComponent(site.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue">{copy.close}</Link> : null}</div>
    </article>)}</div>
    {isOwner ? <Link href={`${POS}?section=store-setup`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm font-bold text-dtsc-blue">{copy.setup}</Link> : null}
  </section>;
}
