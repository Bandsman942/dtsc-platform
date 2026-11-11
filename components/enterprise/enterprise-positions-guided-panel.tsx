"use client";

import { useMemo, useState, type FormEvent } from "react";
import { EnterpriseAdminExportMenu, EnterpriseAdminListToolbar, EnterpriseAdminPagination } from "@/components/enterprise/enterprise-admin-list-toolbar";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseDepartmentItem, EnterpriseModuleItem, EnterprisePositionItem } from "@/lib/enterprise/enterprise-admin-types";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

type GuidedAction = "read" | "submit" | "write" | "approve" | "manage";
type Capability = { moduleCode: string; actions: GuidedAction[] };

type Props = {
  organizationId: string;
  organizationName?: string;
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  modules: EnterpriseModuleItem[];
  locale?: string | null;
  onSaved?: (message: string) => void;
  reloadOnSave?: boolean;
  allowPermissionsEdit?: boolean;
};

const ACTIONS: GuidedAction[] = ["read", "submit", "write", "approve", "manage"];

function tx(locale: string | null | undefined, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

function permissions(position: EnterprisePositionItem | null) {
  return Array.isArray(position?.permissionsJson)
    ? position.permissionsJson.filter((value): value is string => typeof value === "string")
    : [];
}

function permissionMatchesAction(permission: string, action: GuidedAction) {
  if (action === "read") return permission.endsWith(".view") || permission.endsWith(".read") || permission.endsWith(".chat") || permission.includes(".view_");
  if (action === "submit") return permission.endsWith(".create") || permission.endsWith(".submit") || permission.endsWith(".chat") || permission.endsWith(".dispense");
  if (action === "write") return permission.endsWith(".create") || permission.endsWith(".update") || permission.endsWith(".validate") || permission.endsWith(".manage") || permission.endsWith(".dispense");
  if (action === "approve") return permission.endsWith(".approve") || permission.endsWith(".validate") || permission.endsWith(".manage");
  return permission.endsWith(".manage") || permission.endsWith(".admin");
}

function initialCapabilities(position: EnterprisePositionItem | null, modules: EnterpriseModuleItem[]) {
  const current = permissions(position);
  const result: Capability[] = [];
  for (const moduleItem of modules) {
    const code = normalizeEnterpriseModuleCode(moduleItem.canonicalCode || moduleItem.moduleCode);
    const definition = getEnterpriseModuleDefinition(code);
    if (!definition?.permissionPrefixes.length) continue;
    const related = current.filter((permission) => definition.permissionPrefixes.some((prefix) => permission.startsWith(prefix)));
    const actions = ACTIONS.filter((action) => related.some((permission) => permissionMatchesAction(permission, action)));
    if (actions.length) result.push({ moduleCode: code, actions });
  }
  return result;
}

function actionLabel(locale: string | null | undefined, action: GuidedAction) {
  if (action === "read") return tx(locale, "Consulter", "View");
  if (action === "submit") return tx(locale, "Créer / soumettre", "Create / submit");
  if (action === "write") return tx(locale, "Modifier", "Edit");
  if (action === "approve") return tx(locale, "Approuver / valider", "Approve / validate");
  return tx(locale, "Administrer", "Administer");
}

export function EnterprisePositionsGuidedPanel({ organizationId, organizationName, departments, positions, modules, locale, onSaved, reloadOnSave = true, allowPermissionsEdit = true }: Props) {
  const [editing, setEditing] = useState<EnterprisePositionItem | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const availableModules = useMemo(() => modules.filter((module) => {
    if (!module.isEnabled || !module.registryKnown || module.accessAllowed === false || module.routeKind === "ADMIN_SECTION") return false;
    const definition = getEnterpriseModuleDefinition(normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode));
    return Boolean(definition?.permissionPrefixes.length);
  }), [modules]);
  const filtered = positions.filter((position) => (filter === "ALL" || (filter === "ACTIVE" ? position.isActive : filter === "KEY" ? position.isKeyPosition : !position.isActive)) && `${position.labelFr} ${position.labelEn} ${position.positionCode} ${position.department?.labelFr || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const pageItems = filtered.slice((page - 1) * 12, page * 12);
  const report: ProfessionalReportExportModel = {
    title: tx(locale, "Registre des postes", "Position register"), organizationName: organizationName || "DTSC Platform",
    filenameBase: `dtsc-administration-postes-${organizationId}`, generatedLabel: new Date().toLocaleString(locale === "en" ? "en" : "fr"),
    kpis: [{ label: tx(locale, "Postes filtrés", "Filtered positions"), value: String(filtered.length) }], chart: [],
    columns: [{ key: "label", label: tx(locale, "Poste", "Position") }, { key: "department", label: tx(locale, "Département", "Department") }, { key: "status", label: tx(locale, "Statut", "Status") }, { key: "level", label: tx(locale, "Niveau", "Level") }, { key: "key", label: tx(locale, "Poste clé", "Key position") }],
    rows: filtered.map((item) => ({ label: locale === "en" ? item.labelEn : item.labelFr, department: locale === "en" ? item.department?.labelEn || "—" : item.department?.labelFr || "—", status: item.isActive ? tx(locale, "Actif", "Active") : tx(locale, "Inactif", "Inactive"), level: item.hierarchyLevel, key: item.isKeyPosition ? tx(locale, "Oui", "Yes") : tx(locale, "Non", "No") })),
    insights: [{ title: tx(locale, "Gouvernance", "Governance"), body: tx(locale, "Les droits effectifs sont calculés à partir des postes, rôles, abonnements et restrictions par module.", "Effective rights depend on positions, roles, subscription and module restrictions.") }],
    filters: [{ label: tx(locale, "Recherche", "Search"), value: search || "—" }, { label: tx(locale, "Statut", "Status"), value: filter }],
  };

  function openEditor(position: EnterprisePositionItem | null) {
    setEditing(position);
    setSelectedCapabilities(allowPermissionsEdit ? initialCapabilities(position, availableModules) : []);
    setMessage("");
    setOpen(true);
  }

  function toggleCapability(moduleCode: string, action: GuidedAction, checked: boolean) {
    setSelectedCapabilities((current) => {
      const normalized = normalizeEnterpriseModuleCode(moduleCode);
      const existing = current.find((item) => item.moduleCode === normalized);
      const actions = new Set<GuidedAction>(existing?.actions || []);
      if (checked) actions.add(action); else actions.delete(action);
      const without = current.filter((item) => item.moduleCode !== normalized);
      return actions.size ? [...without, { moduleCode: normalized, actions: Array.from(actions) }] : without;
    });
  }

  function isChecked(moduleCode: string, action: GuidedAction) {
    return selectedCapabilities.find((item) => item.moduleCode === normalizeEnterpriseModuleCode(moduleCode))?.actions.includes(action) || false;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (editing?.isActive && form.get("isActive") !== "on") {
        const { confirmSensitiveAction } = await import("@/lib/client-confirmation");
        const decision = await confirmSensitiveAction({
          title: tx(locale, "Désactiver le poste", "Deactivate position"),
          description: tx(locale, "Ce poste deviendra inactif, sans supprimer les rattachements ni les autorisations historiques.", "This position will become inactive without removing historic assignments or permissions."),
          confirmLabel: tx(locale, "Désactiver", "Deactivate"),
          cancelLabel: tx(locale, "Annuler", "Cancel"),
          tone: "warning",
        });
        if (!decision.confirmed) return;
      }
      const response = await fetch(`/api/enterprise/${organizationId}/administration/positions-guided`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: editing?.id || undefined,
          locale: locale === "en" ? "en" : "fr",
          label: String(form.get("label") || ""),
          description: String(form.get("description") || ""),
          departmentId: String(form.get("departmentId") || ""),
          hierarchyLevel: Number(form.get("hierarchyLevel") || 1),
          isKeyPosition: form.get("isKeyPosition") === "on",
          isActive: form.get("isActive") === "on",
          capabilities: allowPermissionsEdit ? selectedCapabilities : [],
          preservePermissions: !allowPermissionsEdit,
        }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || tx(locale, "Enregistrement impossible.", "Unable to save."));
      const success = editing ? tx(locale, "Poste mis à jour.", "Position updated.") : tx(locale, "Poste créé.", "Position created.");
      setOpen(false);
      setEditing(null);
      setSelectedCapabilities([]);
      setMessage(success);
      onSaved?.(success);
      if (reloadOnSave) window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tx(locale, "Enregistrement impossible.", "Unable to save."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <div className="min-w-0">
        <p className="font-black text-dtsc-ink">{allowPermissionsEdit ? tx(locale, "Postes et autorisations guidées", "Positions and guided permissions") : tx(locale, "Postes officiels", "Official positions")}</p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{allowPermissionsEdit ? tx(locale, "Choisissez ce que chaque fonction peut faire dans les services réellement actifs de votre entreprise. Les codes techniques restent gérés par DTSC.", "Choose what each function can do in the services actually active for your company. Technical permission codes remain managed by DTSC.") : tx(locale, "Gérez les libellés, rattachements et états sans modifier les autorisations du poste.", "Manage position names, assignments and status without changing their permissions.")}</p>
      </div>
      <Button type="button" onClick={() => openEditor(null)}><Plus className="h-4 w-4" />{tx(locale, "Nouveau poste", "New position")}</Button>
    </div>

    {message ? <p role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{message}</p> : null}

    <EnterpriseAdminListToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={tx(locale, "Rechercher un poste, un département…", "Search positions or departments…")}
      filters={[{ value: "ALL", label: tx(locale, "Tous", "All"), count: positions.length }, { value: "ACTIVE", label: tx(locale, "Actifs", "Active"), count: positions.filter((item) => item.isActive).length }, { value: "INACTIVE", label: tx(locale, "Inactifs", "Inactive"), count: positions.filter((item) => !item.isActive).length }, { value: "KEY", label: tx(locale, "Postes clés", "Key positions"), count: positions.filter((item) => item.isKeyPosition).length }]}
      filter={filter} onFilterChange={(value) => { setFilter(value); setPage(1); }} resultCount={filtered.length} locale={locale}>
      <EnterpriseAdminExportMenu model={report} locale={locale} />
    </EnterpriseAdminListToolbar>

    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {pageItems.map((position) => {
        const count = permissions(position).length;
        const label = locale === "en" ? position.labelEn : position.labelFr;
        const department = position.department ? (locale === "en" ? position.department.labelEn : position.department.labelFr) : null;
        return <article key={position.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-black text-dtsc-ink">{label}</p><p className="mt-1 text-xs text-dtsc-muted">{department || tx(locale, "Sans département par défaut", "No default department")}</p></div>
            <StatusBadge tone={position.isActive ? "success" : "neutral"}>{position.isActive ? tx(locale, "Actif", "Active") : tx(locale, "Inactif", "Inactive")}</StatusBadge>
          </div>
          <p className="mt-3 text-sm text-dtsc-muted">{position.descriptionFr || tx(locale, "Aucune description.", "No description.")}</p>
          <div className="mt-3 flex flex-wrap gap-2"><StatusBadge>{tx(locale, `${count} autorisation(s)`, `${count} permission(s)`)}</StatusBadge>{position.isKeyPosition ? <StatusBadge tone="info">{tx(locale, "Poste clé", "Key position")}</StatusBadge> : null}</div>
          <Button type="button" variant="outline" className="mt-4" onClick={() => openEditor(position)}><Pencil className="h-4 w-4" />{tx(locale, "Configurer", "Configure")}</Button>
        </article>;
      })}
    </div>
    <EnterpriseAdminPagination page={page} pageCount={pageCount} onPageChange={setPage} locale={locale} />

    <Dialog open={open} onClose={() => setOpen(false)} title={editing ? tx(locale, "Modifier le poste", "Edit position") : tx(locale, "Nouveau poste", "New position")} description={allowPermissionsEdit ? tx(locale, "Les autorisations sont traduites en droits techniques par le backend et restent limitées à cette entreprise.", "Permissions are translated into technical rights by the backend and remain limited to this company.") : tx(locale, "Les autorisations existantes restent inchangées.", "Existing permissions remain unchanged.")} className="h-[94dvh] max-w-5xl overflow-x-hidden">
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-black text-dtsc-muted">{tx(locale, "Nom du poste", "Position name")}<Input name="label" required minLength={2} defaultValue={editing ? (locale === "en" ? editing.labelEn : editing.labelFr) : ""} /></label>
          <label className="grid gap-1 text-xs font-black text-dtsc-muted">{tx(locale, "Département par défaut", "Default department")}<select name="departmentId" defaultValue={editing?.departmentId || ""} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="">{tx(locale, "Aucun", "None")}</option>{departments.filter((department) => department.isActive).map((department) => <option key={department.id} value={department.id}>{locale === "en" ? department.labelEn : department.labelFr}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-black text-dtsc-muted">{tx(locale, "Niveau hiérarchique", "Hierarchy level")}<Input name="hierarchyLevel" type="number" min="1" max="99" defaultValue={editing?.hierarchyLevel || 1} /></label>
          <label className="grid gap-1 text-xs font-black text-dtsc-muted md:col-span-2">{tx(locale, "Description", "Description")}<textarea name="description" defaultValue={editing?.descriptionFr || ""} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></label>
        </div>

        {allowPermissionsEdit ? <><div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4">
          <p className="flex items-center gap-2 font-black text-dtsc-ink"><ShieldCheck className="h-4 w-4 text-cyan-600" />{tx(locale, "Autorisations par service", "Permissions by service")}</p>
          <p className="mt-1 text-sm text-dtsc-muted">{tx(locale, "Seuls les services actifs et autorisés pour l’entreprise apparaissent ici.", "Only services active and allowed for the company appear here.")}</p>
        </div>

        <div className="grid gap-3">
          {availableModules.map((module) => {
            const code = normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode);
            const label = locale === "en" ? module.labelEn : module.labelFr;
            return <fieldset key={module.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
              <legend className="px-2 text-sm font-black text-dtsc-ink">{label}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {ACTIONS.map((action) => <label key={action} className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={isChecked(code, action)} onChange={(event) => toggleCapability(code, action, event.target.checked)} />{actionLabel(locale, action)}</label>)}
              </div>
            </fieldset>;
          })}
          {!availableModules.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{tx(locale, "Aucun service actif ne propose actuellement d’autorisations configurables.", "No active service currently exposes configurable permissions.")}</p> : null}
        </div></> : <p className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-dtsc-muted">{tx(locale, "Les autorisations de ce poste restent inchangées. Ouvrez Administration entreprise pour modifier les droits d’accès.", "This position’s permissions remain unchanged. Open Company administration to change access rights.")}</p>}

        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="isKeyPosition" type="checkbox" defaultChecked={editing?.isKeyPosition || false} />{tx(locale, "Poste clé", "Key position")}</label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="isActive" type="checkbox" defaultChecked={editing?.isActive ?? true} />{tx(locale, "Poste actif", "Active position")}</label>
        </div>
        {message ? <p role="status" className="rounded-xl bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{message}</p> : null}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{tx(locale, "Annuler", "Cancel")}</Button><Button type="submit" disabled={busy}>{busy ? tx(locale, "Enregistrement…", "Saving…") : tx(locale, "Enregistrer le poste", "Save position")}</Button></div>
      </form>
    </Dialog>
  </div>;
}
