"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type StaffRole = "MANAGER" | "INVOICER" | "CASHIER";
type Row = { id: string; siteId: string; userId: string; roleCode: StaffRole; permissions: string[]; isActive: boolean; revision: number };
type Data = {
  items: Row[];
  sites: { id: string; name: string; code: string }[];
  members: { userId: string; name: string; role: string }[];
  defaults: Record<StaffRole, string[]>;
  capabilities: string[];
  isolationEnabled: boolean;
};

const dictionary = {
  fr: {
    title: "Personnel et accès par boutique", description: "Attribuez un rôle différent selon la boutique, puis adaptez précisément les autorisations. Les comptes propriétaires conservent leur accès transversal.",
    site: "Boutique", member: "Collaborateur", role: "Fonction", permissions: "Autorisations de cette affectation", active: "Affectation active",
    manager: "Gérant", invoicer: "Facturier", cashier: "Caissier", selectSite: "Choisir une boutique", selectMember: "Choisir un collaborateur",
    save: "Enregistrer l’affectation", saving: "Enregistrement…", saved: "Affectation du collaborateur enregistrée.",
    loading: "Chargement des affectations…", error: "Impossible de charger les accès du personnel.", list: "Affectations existantes",
    empty: "Aucune affectation enregistrée.", edit: "Modifier", enabled: "Active", disabled: "Désactivée", legacy: "Isolation stricte en préparation : les règles spécifiques aux boutiques ne sont pas encore activées sur toutes les API ERP.",
    activeIsolation: "Isolation stricte des boutiques active", ownerExcluded: "Les propriétaires et administrateurs d’entreprise sont gérés dans l’administration générale.",
    capability: {
      VIEW_STOCK: "Consulter les stocks", MANAGE_STOCK: "Gérer les mouvements, inventaires et ajustements de stock", VIEW_SALES: "Consulter les ventes", PREPARE_INVOICE: "Préparer les factures", CANCEL_UNPAID_INVOICE: "Annuler une facture impayée",
      COLLECT_PAYMENT: "Encaisser les paiements", CLOSE_CASH: "Clôturer la caisse", VIEW_REPORTS: "Consulter les rapports", AUTHORIZE_TRANSFER: "Autoriser un transfert",
      RECORD_EXPENSE: "Enregistrer une dépense", APPROVE_EXPENSE: "Valider une dépense",
      REQUEST_INVOICE_RETURN: "Demander un retour sur facture payée", APPROVE_INVOICE_RETURN: "Autoriser un retour sur facture (Finance indépendante)",
    },
  },
  en: {
    title: "Staff and store access", description: "Assign different roles per store and adjust individual capabilities. Organization owners retain their overall access.",
    site: "Store", member: "Staff member", role: "Role", permissions: "Assignment permissions", active: "Assignment active",
    manager: "Store manager", invoicer: "Invoicing clerk", cashier: "Cashier", selectSite: "Select a store", selectMember: "Select a staff member",
    save: "Save assignment", saving: "Saving…", saved: "Staff assignment saved.",
    loading: "Loading assignments…", error: "Unable to load store staff access.", list: "Existing assignments",
    empty: "No assignments recorded.", edit: "Edit", enabled: "Active", disabled: "Disabled", legacy: "Strict isolation is being prepared: store-specific access rules are not yet active on every ERP API.",
    activeIsolation: "Strict store isolation enabled", ownerExcluded: "Owners and organization administrators are managed in general administration.",
    capability: {
      VIEW_STOCK: "View stock", MANAGE_STOCK: "Manage stock movements, counts and adjustments", VIEW_SALES: "View sales", PREPARE_INVOICE: "Prepare invoices", CANCEL_UNPAID_INVOICE: "Cancel unpaid invoice",
      COLLECT_PAYMENT: "Collect payments", CLOSE_CASH: "Close cash register", VIEW_REPORTS: "View reports", AUTHORIZE_TRANSFER: "Authorize transfer",
      RECORD_EXPENSE: "Record expense", APPROVE_EXPENSE: "Approve expense",
      REQUEST_INVOICE_RETURN: "Request a paid-invoice return", APPROVE_INVOICE_RETURN: "Approve an invoice return (independent Finance)",
    },
  },
} as const;

export function RetailSiteStaffAccess({ organizationId, locale }: { organizationId: string; locale: "fr" | "en" }) {
  const copy = dictionary[locale];
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [siteId, setSiteId] = useState("");
  const [userId, setUserId] = useState("");
  const [roleCode, setRoleCode] = useState<StaffRole>("INVOICER");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/site-assignments`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (Data & { message?: string }) | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || copy.error);
      setData(payload);
      setError("");
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [copy.error, locale, organizationId]);

  useEffect(() => { void load(); }, [load]);
  const staff = useMemo(() => data?.members.filter((member) => !["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(member.role)) || [], [data?.members]);
  const selected = data?.items.find((row) => row.siteId === siteId && row.userId === userId) || null;

  function choose(site: string, user: string, source = data) {
    setSiteId(site); setUserId(user);
    const existing = source?.items.find((row) => row.siteId === site && row.userId === user);
    const nextRole = existing?.roleCode || "INVOICER";
    setRoleCode(nextRole);
    setPermissions(existing?.permissions || source?.defaults[nextRole] || []);
    setIsActive(existing?.isActive ?? true);
  }

  async function save() {
    if (!data || !siteId || !userId || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/site-assignments`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, userId, roleCode, permissions, isActive, revision: selected?.revision }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || copy.error);
      toastSuccess(copy.saved);
      await load();
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setSaving(false); }
  }

  return (
    <section id="retail-site-staff-access" data-testid="retail-site-staff-access" className="min-w-0 scroll-mt-24 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <UsersRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" />
        <div className="min-w-0 flex-1"><h2 className="text-base font-black text-dtsc-ink">{copy.title}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.description}</p></div>
      </div>
      {loading ? <p className="mt-4 text-sm text-dtsc-muted" role="status">{copy.loading}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
      {data ? <>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{data.isolationEnabled ? copy.activeIsolation : copy.legacy}</p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-sm font-bold text-dtsc-ink">{copy.site}<select aria-label={copy.site} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-dtsc-ink" value={siteId} onChange={(event) => choose(event.target.value, userId)}><option value="">{copy.selectSite}</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <label className="min-w-0 text-sm font-bold text-dtsc-ink">{copy.member}<select aria-label={copy.member} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-dtsc-ink" value={userId} onChange={(event) => choose(siteId, event.target.value)}><option value="">{copy.selectMember}</option>{staff.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
          <label className="min-w-0 text-sm font-bold text-dtsc-ink">{copy.role}<select aria-label={copy.role} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-dtsc-ink" value={roleCode} onChange={(event) => { const role = event.target.value as StaffRole; setRoleCode(role); setPermissions(data.defaults[role]); }}><option value="MANAGER">{copy.manager}</option><option value="INVOICER">{copy.invoicer}</option><option value="CASHIER">{copy.cashier}</option></select></label>
        </div>
        <fieldset className="mt-4 min-w-0"><legend className="text-sm font-black text-dtsc-ink">{copy.permissions}</legend><div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">{data.capabilities.map((capability) => <label key={capability} className="flex min-w-0 items-center gap-3 rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-sm text-dtsc-ink"><input type="checkbox" checked={permissions.includes(capability)} onChange={(event) => setPermissions((current) => event.target.checked ? [...new Set([...current, capability])] : current.filter((entry) => entry !== capability))} className="h-4 w-4 accent-cyan-600" />{copy.capability[capability as keyof typeof copy.capability]}</label>)}</div></fieldset>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-semibold text-dtsc-ink"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 accent-cyan-600" />{copy.active}</label><Button disabled={!siteId || !userId || saving} onClick={() => void save()}>{saving ? copy.saving : copy.save}</Button></div>
        <div className="mt-5 border-t border-dtsc-border pt-4"><h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />{copy.list}</h3><p className="mt-1 text-xs text-dtsc-muted">{copy.ownerExcluded}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.items.length ? data.items.map((row) => <button type="button" key={row.id} onClick={() => choose(row.siteId, row.userId)} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left text-sm text-dtsc-ink transition hover:border-dtsc-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"><span className="min-w-0"><span className="block truncate font-bold">{data.members.find((member) => member.userId === row.userId)?.name || copy.member}</span><span className="mt-0.5 block text-xs text-dtsc-muted">{data.sites.find((site) => site.id === row.siteId)?.name || copy.site} · {row.roleCode === "MANAGER" ? copy.manager : row.roleCode === "INVOICER" ? copy.invoicer : copy.cashier}</span></span><span className={row.isActive ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300" : "rounded-full bg-slate-500/10 px-2 py-1 text-xs font-bold text-dtsc-muted"}>{row.isActive ? copy.enabled : copy.disabled}</span></button>) : <p className="text-sm text-dtsc-muted">{copy.empty}</p>}</div></div>
      </> : null}
    </section>
  );
}
