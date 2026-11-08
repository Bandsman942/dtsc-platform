"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Store } from "lucide-react";
import { FinanceReferenceSelect } from "@/components/enterprise/core-v2/finance-reference-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type StoreSummary = {
  id: string;
  name: string;
  warehouseCount: number;
  cashReady: boolean;
  staffCount: number;
  readiness: { warehouse: boolean; cash: boolean; team: boolean; isolation: boolean; finance: boolean; catalog: boolean; stock: boolean; checkout: boolean };
};

const copies = {
  fr: {
    heading: "Assistant d’ouverture d’une boutique", intro: "Progression conservée à partir des données ERP réelles. Vous pouvez quitter puis reprendre cette configuration.",
    steps: ["Boutique", "Dépôt", "Caisse", "Équipe", "Stock", "Activation"] as const,
    newStore: "Nouvelle boutique", name: "Nom de la boutique", city: "Ville", address: "Adresse (facultatif)", createStore: "Créer la boutique", creating: "Enregistrement…",
    storeHelp: "Ajoutez un point de vente à cette entreprise. Chaque boutique partage la société, mais dispose de ses propres stocks et caisses.",
    warehouseName: "Nom de l’entrepôt", createWarehouse: "Créer le dépôt", warehouseDone: "Un dépôt actif existe déjà pour cette boutique.",
    cashName: "Nom de la caisse", ledger: "Compte comptable de caisse", createCash: "Créer le compte de caisse", cashDone: "Une caisse dans la devise principale est déjà reliée à la boutique.",
    financeHelp: "Créez d’abord un plan comptable et son compte de caisse si aucun compte n’est proposé. Le solde d’ouverture est fixé à zéro pour cette configuration test.",
    members: "Inviter les collaborateurs", assign: "Affecter leurs rôles et droits par boutique", teamHelp: "Chaque collaborateur doit avoir un compte DTSC et accepter son invitation avant son affectation. Prévoir les droits de vente, facturation, encaissement et clôture.",
    stock: "Charger le catalogue et les stocks", stockHelp: "Créez les produits et leurs prix, puis entrez les quantités dans l’entrepôt de cette boutique. Un magasin de services peut ne pas avoir de stock physique.",
    activation: "Contrôler et activer", activationHelp: "Vérifiez la préparation financière et activez l’isolation puis la facturation via le circuit MFA déjà en place.",
    goInventory: "Ouvrir le stock", goCatalog: "Configurer le catalogue", goFinance: "Configuration Finance", goActivation: "Ouvrir l’activation sécurisée", goReadiness: "Contrôle global", next: "Étape suivante", selectFirst: "Créez ou sélectionnez une boutique pour continuer.",
    savedSite: "Boutique créée. Poursuivez avec son dépôt.", savedWarehouse: "Dépôt de cette boutique créé.", savedCash: "Compte de caisse créé pour cette boutique.", error: "L’enregistrement a échoué. Vérifiez les informations et les permissions de vos modules ERP.",
    progress: "Préparation",
  },
  en: {
    heading: "Store opening assistant", intro: "Progress is recovered from real ERP records. You can leave and resume setup at any time.",
    steps: ["Store", "Warehouse", "Till", "Team", "Inventory", "Activation"] as const,
    newStore: "New store", name: "Store name", city: "City", address: "Address (optional)", createStore: "Create store", creating: "Saving…",
    storeHelp: "Add a retail site to this company. Stores share the company while keeping their own inventory and tills.",
    warehouseName: "Warehouse name", createWarehouse: "Create warehouse", warehouseDone: "An active warehouse already exists for this store.",
    cashName: "Till account name", ledger: "Cash ledger account", createCash: "Create cash account", cashDone: "A base-currency cash account is already linked to this store.",
    financeHelp: "Set up your chart of accounts and cash ledger account first if no account is available. The opening balance for this test is zero.",
    members: "Invite team members", assign: "Assign store roles and permissions", teamHelp: "Each employee needs a DTSC account and must accept the invitation before assignment. Grant sales, invoicing, payment and closing permissions.",
    stock: "Load catalogue and inventory", stockHelp: "Create products with prices, then receive quantities into this store’s warehouse. Service-only stores may not need physical inventory.",
    activation: "Review and activate", activationHelp: "Check finance readiness, then enable store isolation and invoice checkout using the existing MFA workflow.",
    goInventory: "Open inventory", goCatalog: "Configure catalogue", goFinance: "Finance setup", goActivation: "Open secured activation", goReadiness: "Overall readiness", next: "Next step", selectFirst: "Create or select a store to continue.",
    savedSite: "Store created. Continue with its warehouse.", savedWarehouse: "Store warehouse created.", savedCash: "Store cash account created.", error: "Could not save. Check the details and your ERP module permissions.",
    progress: "Readiness",
  },
} as const;

export function RetailGuidedStoreSetup({ organizationId, locale, baseCurrency, selectedSite, sites }: {
  organizationId: string;
  locale: "fr" | "en";
  baseCurrency: string;
  selectedSite: StoreSummary | null;
  sites: StoreSummary[];
}) {
  const router = useRouter();
  const c = copies[locale];
  const suggestedStage = selectedSite ? (selectedSite.warehouseCount ? selectedSite.cashReady ? 3 : 2 : 1) : 0;
  const [stage, setStage] = useState(suggestedStage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stepComplete = [Boolean(selectedSite), Boolean(selectedSite?.readiness.warehouse), Boolean(selectedSite?.readiness.cash), Boolean(selectedSite?.readiness.team), Boolean(selectedSite?.readiness.catalog && selectedSite?.readiness.stock), Boolean(selectedSite?.readiness.finance && selectedSite?.readiness.isolation && selectedSite?.readiness.checkout)];

  useEffect(() => {
    setStage(suggestedStage);
  }, [selectedSite?.id, suggestedStage]);

  async function save(event: FormEvent<HTMLFormElement>, target: "site" | "warehouse" | "cash") {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = target === "site"
      ? { name: String(form.get("name") || "").trim(), siteType: "STORE", city: String(form.get("city") || "").trim(), addressLine1: String(form.get("address") || "").trim() || null, countryCode: "CD", timezone: "Africa/Kinshasa" }
      : target === "warehouse"
        ? { siteId: selectedSite?.id, name: String(form.get("name") || "").trim(), warehouseType: "RETAIL" }
        : { siteId: selectedSite?.id, name: String(form.get("name") || "").trim(), accountType: "CASH", currencyCode: baseCurrency, ledgerAccountId: String(form.get("ledgerAccountId") || ""), openingBalance: "0" };
    const endpoint = target === "site" ? "sites" : target === "warehouse" ? "warehouses" : "financial-accounts";
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null) as { site?: { id: string }; error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || body?.error || c.error);
      const success = target === "site" ? c.savedSite : target === "warehouse" ? c.savedWarehouse : c.savedCash;
      setNotice(success);
      toastSuccess(success);
      if (target === "site" && body?.site?.id) router.push(`/enterprise-modules/RETAIL_POS?section=store-setup&siteId=${encodeURIComponent(body.site.id)}`);
      else { setStage(target === "warehouse" ? 2 : 3); router.refresh(); }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : c.error;
      setError(message); toastError(message);
    } finally { setBusy(false); }
  }

  const stepHref = `/enterprise-modules/RETAIL_POS?section=store-setup`;
  return <section data-retail-guided-setup aria-label={c.heading} className="rounded-2xl border border-cyan-500/30 bg-dtsc-surface p-4 shadow-sm sm:p-6">
    <div className="flex items-start gap-3"><Store aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-cyan-600" /><div className="min-w-0"><h3 className="text-lg font-black text-dtsc-ink">{c.heading}</h3><p className="mt-1 text-sm leading-6 text-dtsc-muted">{c.intro}</p></div></div>
    <nav aria-label={locale === "fr" ? "Étapes de configuration" : "Setup stages"} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{c.steps.map((label, index) => <button key={label} type="button" aria-current={stage === index ? "step" : undefined} onClick={() => { setStage(index); setError(""); }} className={`min-h-11 rounded-xl border px-2 py-2 text-left text-xs font-bold focus-visible:ring-2 focus-visible:ring-cyan-400 ${stage === index ? "border-cyan-500 bg-cyan-500/10 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted hover:bg-dtsc-soft"}`}><span className="inline-flex items-center gap-1">{stepComplete[index] ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <span aria-hidden="true">{index + 1}.</span>}{label}</span></button>)}</nav>
    <p className="mt-3 text-xs font-bold text-dtsc-muted">{c.progress} : {stepComplete.filter(Boolean).length}/6 {selectedSite ? `· ${selectedSite.name}` : ""}</p>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">{notice}</p> : null}
    <div className="mt-4 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-4">
      {stage === 0 ? <div className="grid gap-3"><p className="text-sm text-dtsc-muted">{c.storeHelp}</p><form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event, "site")}><label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{c.name}<Input required minLength={2} maxLength={160} name="name" placeholder="BCN — Gombe" /></label><label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{c.city}<Input required maxLength={120} name="city" defaultValue="Kinshasa" /></label><label className="grid gap-1 text-sm font-semibold text-dtsc-ink sm:col-span-2">{c.address}<Input maxLength={255} name="address" /></label><Button disabled={busy} className="w-fit">{busy ? c.creating : c.createStore}</Button></form>{sites.length ? <div className="flex flex-wrap gap-2">{sites.map((site) => <Link key={site.id} href={`${stepHref}&siteId=${encodeURIComponent(site.id)}`} className="rounded-xl border border-dtsc-border px-3 py-2 text-sm font-bold text-dtsc-blue">{site.name}</Link>)}</div> : null}</div> : null}
      {stage > 0 && !selectedSite ? <p className="text-sm text-amber-700 dark:text-amber-300"><CircleAlert className="mr-2 inline h-4 w-4" />{c.selectFirst}</p> : null}
      {selectedSite && stage === 1 ? <div className="grid gap-3">{stepComplete[1] ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{c.warehouseDone}</p> : null}<form onSubmit={(event) => void save(event, "warehouse")} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{c.warehouseName}<Input required name="name" maxLength={160} defaultValue={`Dépôt ${selectedSite.name}`} /></label><Button disabled={busy}>{busy ? c.creating : c.createWarehouse}</Button></form></div> : null}
      {selectedSite && stage === 2 ? <div className="grid gap-3">{stepComplete[2] ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{c.cashDone}</p> : null}<p className="text-sm text-dtsc-muted">{c.financeHelp}</p><form onSubmit={(event) => void save(event, "cash")} className="grid gap-3"><label className="grid gap-1 text-sm font-semibold text-dtsc-ink">{c.cashName}<Input required name="name" maxLength={160} defaultValue={`Caisse ${selectedSite.name} · ${baseCurrency}`} /></label><p className="text-sm font-semibold text-dtsc-ink">{baseCurrency} · {locale === "fr" ? "Solde d’ouverture : 0" : "Opening balance: 0"}</p><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="ledger-account" parentId="CASH" name="ledgerAccountId" label={c.ledger} locale={locale} required disabled={busy} /><div className="flex flex-wrap gap-2"><Button disabled={busy}>{busy ? c.creating : c.createCash}</Button><Button asChild variant="outline"><Link href="/enterprise-modules/FINANCE_ACCOUNTING">{c.goFinance}</Link></Button></div></form></div> : null}
      {selectedSite && stage === 3 ? <div className="grid gap-3"><p className="text-sm leading-6 text-dtsc-muted">{c.teamHelp}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/enterprise-admin?section=members">{c.members}</Link></Button><Button asChild><Link href="/enterprise-modules/RETAIL_POS?section=staff">{c.assign}</Link></Button></div></div> : null}
      {selectedSite && stage === 4 ? <div className="grid gap-3"><p className="text-sm leading-6 text-dtsc-muted">{c.stockHelp}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/enterprise-modules/CATALOG#catalog-items">{c.goCatalog}</Link></Button><Button asChild><Link href="/enterprise-modules/INVENTORY_LOGISTICS#inventory-items">{c.goInventory}</Link></Button></div></div> : null}
      {selectedSite && stage === 5 ? <div className="grid gap-3"><p className="text-sm leading-6 text-dtsc-muted">{c.activationHelp}</p><div className="flex flex-wrap gap-2"><Button asChild><Link href="/enterprise-modules/RETAIL_POS?section=activation">{c.goActivation}</Link></Button><Button asChild variant="outline"><Link href="/enterprise-modules/RETAIL_POS?section=readiness">{c.goReadiness}</Link></Button></div></div> : null}
      {selectedSite && stage > 0 && stage < 5 ? <Button variant="outline" className="mt-4" onClick={() => setStage((value) => Math.min(value + 1, 5))}>{c.next}<ArrowRight className="ml-2 h-4 w-4" /></Button> : null}
    </div>
  </section>;
}
