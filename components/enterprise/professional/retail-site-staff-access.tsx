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
  members: { userId: string; name: string; role: string; positionId: string | null; positionTitleFr: string | null; positionTitleEn: string | null }[];
  defaults: Record<StaffRole, string[]>;
  capabilities: string[];
  isolationEnabled: boolean;
  canGrantSelfApproval: boolean;
};

const dictionary = {
  fr: {
    title: "Personnel et accès par boutique", description: "Le poste professionnel reste unique dans Administration entreprise. Ici, configurez uniquement le profil d'accès et les autorisations de chaque boutique.",
    site: "Boutique", member: "Collaborateur", role: "Profil d'accès boutique", officialPosition: "Poste officiel dans l'entreprise", noPosition: "Aucun poste officiel attribué : renseignez-le dans Administration entreprise.", permissions: "Autorisations de cette affectation", active: "Affectation active",
    manager: "Gérant", invoicer: "Facturier", cashier: "Caissier", selectSite: "Choisir une boutique", selectMember: "Choisir un collaborateur",
    save: "Enregistrer l’affectation", saving: "Enregistrement…", saved: "Affectation du collaborateur enregistrée.",
    loading: "Chargement des affectations…", error: "Impossible de charger les accès du personnel.", list: "Affectations existantes",
    empty: "Aucune affectation enregistrée.", edit: "Modifier", enabled: "Active", disabled: "Désactivée", legacy: "Isolation stricte en préparation : les règles spécifiques aux boutiques ne sont pas encore activées sur toutes les API ERP.",
    activeIsolation: "Isolation stricte des boutiques active", ownerExcluded: "Les propriétaires et administrateurs d’entreprise sont gérés dans l’administration générale.",
    capability: {
      VIEW_STOCK: "Consulter les stocks", MANAGE_STOCK: "Gérer les mouvements, inventaires et ajustements de stock", VIEW_SALES: "Consulter les ventes", PREPARE_INVOICE: "Préparer les factures", CANCEL_UNPAID_INVOICE: "Annuler une facture impayée", ISSUE_INVOICE: "Émettre les factures approuvées (droit natif du gérant)",
      COLLECT_PAYMENT: "Encaisser les paiements", OPEN_CASH: "Ouvrir une session de caisse", CLOSE_CASH: "Clôturer la caisse", VIEW_REPORTS: "Consulter les rapports", AUTHORIZE_TRANSFER: "Autoriser un transfert",
      RECORD_EXPENSE: "Enregistrer une dépense", APPROVE_EXPENSE: "Valider une dépense",
      REQUEST_INVOICE_RETURN: "Demander l'annulation / le retour d'une facture encaissée", APPROVE_INVOICE_RETURN: "Approuver une annulation / un retour (Finance)",
      SELF_APPROVE_INVOICE: "Valider soi-même ses propres factures (exception accordée par le propriétaire)",
      SELF_APPROVE_PAYMENT: "Valider et confirmer soi-même ses encaissements (exception accordée par le propriétaire)",
      SELF_APPROVE_INVOICE_RETURN: "Gérant : approuver sa propre demande d'annulation après inspection indépendante",
    },
  },
  en: {
    title: "Staff and store access", description: "The professional position is defined once in Enterprise administration. Configure only the store access profile and its permissions here.",
    site: "Store", member: "Staff member", role: "Store access profile", officialPosition: "Official company position", noPosition: "No company position assigned. Set one in Enterprise administration.", permissions: "Assignment permissions", active: "Assignment active",
    manager: "Store manager", invoicer: "Invoicing clerk", cashier: "Cashier", selectSite: "Select a store", selectMember: "Select a staff member",
    save: "Save assignment", saving: "Saving…", saved: "Staff assignment saved.",
    loading: "Loading assignments…", error: "Unable to load store staff access.", list: "Existing assignments",
    empty: "No assignments recorded.", edit: "Edit", enabled: "Active", disabled: "Disabled", legacy: "Strict isolation is being prepared: store-specific access rules are not yet active on every ERP API.",
    activeIsolation: "Strict store isolation enabled", ownerExcluded: "Owners and organization administrators are managed in general administration.",
    capability: {
      VIEW_STOCK: "View stock", MANAGE_STOCK: "Manage stock movements, counts and adjustments", VIEW_SALES: "View sales", PREPARE_INVOICE: "Prepare invoices", CANCEL_UNPAID_INVOICE: "Cancel unpaid invoice", ISSUE_INVOICE: "Issue approved invoices (native manager right)",
      COLLECT_PAYMENT: "Collect payments", OPEN_CASH: "Open a till session", CLOSE_CASH: "Close cash register", VIEW_REPORTS: "View reports", AUTHORIZE_TRANSFER: "Authorize transfer",
      RECORD_EXPENSE: "Record expense", APPROVE_EXPENSE: "Approve expense",
      REQUEST_INVOICE_RETURN: "Request cancellation / return of a paid invoice", APPROVE_INVOICE_RETURN: "Approve a cancellation / return (Finance)",
      SELF_APPROVE_INVOICE: "Approve own invoices (owner-granted exception)",
      SELF_APPROVE_PAYMENT: "Approve and confirm own collections (owner-granted exception)",
      SELF_APPROVE_INVOICE_RETURN: "Manager: approve own cancellation request after independent inspection",
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
  const selectedMember = staff.find((member) => member.userId === userId);
  const selected = data?.items.find((row) => row.siteId === siteId && row.userId === userId) || null;
  const delegatedRights = new Set(["SELF_APPROVE_INVOICE", "SELF_APPROVE_PAYMENT", "SELF_APPROVE_INVOICE_RETURN"]);
  const canSelectDelegation = (capability: string) => !delegatedRights.has(capability) ||
    (Boolean(data?.canGrantSelfApproval) && Boolean(siteId) && Boolean(userId) &&
      (capability !== "SELF_APPROVE_INVOICE_RETURN" || roleCode === "MANAGER"));
  const updateCapability = (capability: string, enabled: boolean) => setPermissions((current) => {
    const next = new Set(current);
    if (enabled) {
      next.add(capability);
      if (capability === "SELF_APPROVE_INVOICE") next.add("PREPARE_INVOICE");
      if (capability === "SELF_APPROVE_PAYMENT") next.add("COLLECT_PAYMENT");
      if (capability === "SELF_APPROVE_INVOICE_RETURN") {
        next.add("REQUEST_INVOICE_RETURN"); next.add("APPROVE_INVOICE_RETURN");
      }
    } else {
      next.delete(capability);
      if (capability === "PREPARE_INVOICE") next.delete("SELF_APPROVE_INVOICE");
      if (capability === "COLLECT_PAYMENT") next.delete("SELF_APPROVE_PAYMENT");
      if (capability === "REQUEST_INVOICE_RETURN" || capability === "APPROVE_INVOICE_RETURN") next.delete("SELF_APPROVE_INVOICE_RETURN");
    }
    return [...next];
  });

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
        {selectedMember ? <div className="mt-3 min-w-0 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-3 py-2 text-sm">
          <p className="text-xs font-bold text-dtsc-muted">{copy.officialPosition}</p>
          <p className="mt-1 break-words font-black text-dtsc-ink">{(locale === "en" ? selectedMember.positionTitleEn : selectedMember.positionTitleFr) || copy.noPosition}</p>
        </div> : null}
        {permissions.some((permission) => permission.startsWith("SELF_APPROVE_")) ? <p role="note" className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">{locale === "fr" ? "Exception sensible : seul le propriétaire peut l'accorder. Toutes les décisions restent tracées, limitées à cette boutique et soumises aux contrôles Finance, caisse et stock." : "Sensitive exception: only the owner can grant it. Decisions remain audited, scoped to this store and subject to Finance, cash and stock checks."}</p> : null}
        <fieldset className="mt-4 min-w-0"><legend className="text-sm font-black text-dtsc-ink">{copy.permissions}</legend>
          <p className="mt-1 text-xs leading-5 text-dtsc-muted">{locale === "fr" ? "Sélectionnez d'abord une boutique et un collaborateur. Le propriétaire peut accorder chaque dérogation indépendamment. Les droits métiers nécessaires sont activés avec la dérogation ; le retrait est immédiat." : "Choose a store and staff member first. The owner may grant each exception separately. Prerequisites are enabled automatically, and revocation takes effect immediately."}</p>
          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">{data.capabilities.map((capability) => <label key={capability} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm text-dtsc-ink ${delegatedRights.has(capability) ? "border-amber-500/35 bg-amber-500/5" : "border-dtsc-border bg-dtsc-page"}`}>
            <input type="checkbox" disabled={!canSelectDelegation(capability)} checked={permissions.includes(capability)} onChange={(event) => updateCapability(capability, event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-cyan-600 disabled:opacity-40" />
            <span className="min-w-0 flex-1 break-words">{copy.capability[capability as keyof typeof copy.capability]}{delegatedRights.has(capability) ? <span className="mt-1 block text-xs font-medium text-amber-800 dark:text-amber-200">{!data.canGrantSelfApproval ? locale === "fr" ? "Réservé au propriétaire" : "Owner only" : !siteId || !userId ? locale === "fr" ? "Sélectionnez une boutique et un collaborateur" : "Select store and staff" : capability === "SELF_APPROVE_INVOICE_RETURN" && roleCode !== "MANAGER" ? locale === "fr" ? "Profil gérant requis" : "Manager profile required" : locale === "fr" ? "Délégation propriétaire pour cette boutique" : "Owner-delegated, store-scoped"}</span> : null}</span>
          </label>)}</div></fieldset>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-semibold text-dtsc-ink"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 accent-cyan-600" />{copy.active}</label><Button disabled={!siteId || !userId || saving} onClick={() => void save()}>{saving ? copy.saving : copy.save}</Button></div>
        <div className="mt-5 border-t border-dtsc-border pt-4"><h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />{copy.list}</h3><p className="mt-1 text-xs text-dtsc-muted">{copy.ownerExcluded}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.items.length ? data.items.map((row) => <button type="button" key={row.id} onClick={() => choose(row.siteId, row.userId)} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left text-sm text-dtsc-ink transition hover:border-dtsc-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"><span className="min-w-0"><span className="block truncate font-bold">{data.members.find((member) => member.userId === row.userId)?.name || copy.member}</span><span className="mt-0.5 block text-xs text-dtsc-muted">{data.sites.find((site) => site.id === row.siteId)?.name || copy.site} · {row.roleCode === "MANAGER" ? copy.manager : row.roleCode === "INVOICER" ? copy.invoicer : copy.cashier}</span></span><span className={row.isActive ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300" : "rounded-full bg-slate-500/10 px-2 py-1 text-xs font-bold text-dtsc-muted"}>{row.isActive ? copy.enabled : copy.disabled}</span></button>) : <p className="text-sm text-dtsc-muted">{copy.empty}</p>}</div></div>
      </> : null}
    </section>
  );
}
