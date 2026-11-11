"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { EnterpriseAdminExportMenu, EnterpriseAdminListToolbar, EnterpriseAdminPagination } from "@/components/enterprise/enterprise-admin-list-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import type {
  EnterpriseAuditItem,
  EnterpriseMemberItem,
  EnterpriseModuleItem,
  EnterpriseOrganizationRoleItem,
  EnterpriseSecurityPolicyItem,
} from "@/lib/enterprise/enterprise-admin-types";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

function listFromText(value: FormDataEntryValue | null) {
  return String(value || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

async function responseMessage(response: Response, fallbackOk = "Action enregistrée.", fallbackError = "Action impossible.") {
  const body = (await response.json().catch(() => null)) as { message?: string; reason?: string } | null;
  return body?.message || body?.reason || (response.ok ? fallbackOk : fallbackError);
}

type GuidedAction = "read" | "submit" | "write" | "approve" | "manage";
const guidedActions: GuidedAction[] = ["read", "submit", "write", "approve", "manage"];

export function EnterpriseRolesPermissionsPanel({ organizationId, organizationName, roles, members, modules }: { organizationId: string; organizationName?: string; roles: EnterpriseOrganizationRoleItem[]; members: EnterpriseMemberItem[]; modules: EnterpriseModuleItem[] }) {
  const router = useRouter();
  const rawLocale = useAppLocale();
  const locale = rawLocale === "en" ? "en" : "fr";
  const english = locale === "en";
  const [message, setMessage] = useState("");
  const [simulation, setSimulation] = useState<{ allowed: boolean; reasonCode: string; reason: string } | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, GuidedAction[]>>({});
  const [selfApprovalModules, setSelfApprovalModules] = useState<string[]>([]);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [rolePage, setRolePage] = useState(1);
  const [editingRole, setEditingRole] = useState<EnterpriseOrganizationRoleItem | null>(null);

  const copy = english ? {
    system: "SYSTEM", active: "ACTIVE", inactive: "INACTIVE", noDescription: "Organization role without a description.", services: "services", assignments: "assignments",
    newRole: "New custom role", roleName: "Role name", roleDescription: "Describe the responsibilities attached to this role", chooseCapabilities: "Choose business capabilities", chooseCapabilitiesHelp: "Only services enabled for this company are shown. DTSC derives technical permissions on the server; you never have to enter a permission code.",
    createRole: "Create role", assignment: "Controlled assignment", collaborator: "Collaborator", role: "Role", action: "Action", assign: "Assign", revoke: "Revoke", reason: "Auditable reason", apply: "Apply",
    simulation: "Access simulation", simulationHelp: "Check what a collaborator can do without changing any permission.", simulate: "Simulate", allowed: "Allowed", denied: "Denied",
    select: "Select", service: "Service", read: "View", submit: "Create / submit", write: "Edit", approve: "Approve / validate", manage: "Administer",
    overrideTitle: "Emergency self-approval", overrideHelp: "Disabled by default. When enabled for a service, self-approval is still allowed only if no other eligible approver exists. Every use remains tenant-scoped and audited.", saveOverride: "Save validation policy",
    policySaved: "Validation policy saved.", policyError: "Unable to save the validation policy.", roleCreated: "Role created.", roleError: "Unable to create the role.", assigned: "Assignment updated.", assignmentError: "Unable to update the assignment.", simulated: "Simulation completed without changing permissions.", simulationError: "Unable to run the simulation.",
  } : {
    system: "SYSTÈME", active: "ACTIF", inactive: "INACTIF", noDescription: "Rôle d’organisation sans description.", services: "services", assignments: "affectations",
    newRole: "Nouveau rôle personnalisé", roleName: "Nom du rôle", roleDescription: "Décrivez les responsabilités attachées à ce rôle", chooseCapabilities: "Choisir les capacités métier", chooseCapabilitiesHelp: "Seuls les services activés pour cette entreprise sont proposés. DTSC dérive les permissions techniques côté serveur : vous n’avez aucun code de permission à saisir.",
    createRole: "Créer le rôle", assignment: "Affectation contrôlée", collaborator: "Collaborateur", role: "Rôle", action: "Action", assign: "Affecter", revoke: "Révoquer", reason: "Motif auditable", apply: "Appliquer",
    simulation: "Simulation d’accès", simulationHelp: "Vérifiez ce qu’un collaborateur peut faire sans modifier aucune permission.", simulate: "Simuler", allowed: "Autorisé", denied: "Refusé",
    select: "Sélectionner", service: "Service", read: "Consulter", submit: "Créer / soumettre", write: "Modifier", approve: "Approuver / valider", manage: "Administrer",
    overrideTitle: "Auto-validation de secours", overrideHelp: "Désactivée par défaut. Lorsqu’elle est activée pour un service, l’auto-validation reste possible uniquement si aucun autre validateur éligible n’existe. Chaque usage reste limité à cette entreprise et audité.", saveOverride: "Enregistrer la politique de validation",
    policySaved: "Politique de validation enregistrée.", policyError: "Impossible d’enregistrer la politique de validation.", roleCreated: "Rôle créé.", roleError: "Impossible de créer le rôle.", assigned: "Affectation mise à jour.", assignmentError: "Impossible de modifier l’affectation.", simulated: "Simulation terminée sans modifier les permissions.", simulationError: "Simulation impossible.",
  };

  const visibleModules = useMemo(() => modules.filter((module) => {
    if (!module.isEnabled || module.registryKnown === false || module.accessAllowed === false || module.routeKind === "ADMIN_SECTION") return false;
    const code = normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode);
    const definition = getEnterpriseModuleDefinition(code);
    return Boolean(definition && definition.permissionPrefixes.length && definition.accessPolicy !== "EXPLICIT_DENY");
  }), [modules]);
  const filteredRoles = roles.filter((role) => (roleFilter === "ALL" || (roleFilter === "SYSTEM" ? role.isSystem : roleFilter === "ACTIVE" ? role.isActive : !role.isActive)) && `${role.code} ${role.labelFr} ${role.labelEn} ${role.descriptionFr || ""}`.toLocaleLowerCase().includes(roleSearch.trim().toLocaleLowerCase()));
  const rolePageCount = Math.max(1, Math.ceil(filteredRoles.length / 12));
  const pageRoles = filteredRoles.slice((rolePage - 1) * 12, rolePage * 12);
  const roleReport: ProfessionalReportExportModel = {
    title: english ? "Organization roles" : "Registre des rôles", organizationName: organizationName || "DTSC Platform",
    filenameBase: `dtsc-administration-roles-${organizationId}`, generatedLabel: new Date().toLocaleString(english ? "en" : "fr"),
    kpis: [{ label: english ? "Filtered roles" : "Rôles filtrés", value: String(filteredRoles.length) }], chart: [],
    columns: [{ key: "name", label: english ? "Role" : "Rôle" }, { key: "code", label: "Code" }, { key: "status", label: english ? "Status" : "Statut" }, { key: "members", label: english ? "Assignments" : "Affectations" }],
    rows: filteredRoles.map((role) => ({ name: english ? role.labelEn : role.labelFr, code: role.code, status: role.isSystem ? copy.system : role.isActive ? copy.active : copy.inactive, members: role.assignments.length })),
    insights: [{ title: english ? "Security" : "Sécurité", body: english ? "System roles are protected; assignments and permissions are enforced on the server." : "Les rôles système sont protégés ; affectations et permissions restent contrôlées côté serveur." }],
    filters: [{ label: english ? "Status" : "Statut", value: roleFilter }, { label: english ? "Search" : "Recherche", value: roleSearch || "—" }],
  };

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRole) return;
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/administration/roles/${editingRole.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelFr: data.get("labelFr"), labelEn: data.get("labelEn"), descriptionFr: data.get("descriptionFr"), descriptionEn: data.get("descriptionEn"), isActive: data.get("isActive") === "true" }),
      });
      setMessage(await responseMessage(response, english ? "Role updated." : "Rôle mis à jour.", english ? "Unable to update role." : "Modification du rôle impossible."));
      if (response.ok) { setEditingRole(null); router.refresh(); }
    } catch {
      setMessage(english ? "Network interrupted while saving the role." : "Connexion interrompue pendant l’enregistrement du rôle.");
    }
  }

  useEffect(() => {
    let active = true;
    setPolicyLoading(true);
    void fetch(`/api/enterprise/${organizationId}/administration/approval-policy`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { policy?: { selfApprovalModuleCodes?: string[] } } | null;
        if (!response.ok) throw new Error("POLICY_LOAD_FAILED");
        if (active) setSelfApprovalModules(Array.isArray(body?.policy?.selfApprovalModuleCodes) ? body!.policy!.selfApprovalModuleCodes! : []);
      })
      .catch(() => { if (active) setSelfApprovalModules([]); })
      .finally(() => { if (active) setPolicyLoading(false); });
    return () => { active = false; };
  }, [organizationId]);

  function toggleCapability(moduleCode: string, action: GuidedAction) {
    setCapabilities((current) => {
      const selected = new Set(current[moduleCode] || []);
      if (selected.has(action)) selected.delete(action); else selected.add(action);
      return { ...current, [moduleCode]: Array.from(selected) as GuidedAction[] };
    });
  }

  function toggleSelfApproval(moduleCode: string) {
    setSelfApprovalModules((current) => current.includes(moduleCode) ? current.filter((code) => code !== moduleCode) : [...current, moduleCode]);
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedCapabilities = Object.entries(capabilities).filter(([, actions]) => actions.length).map(([moduleCode, actions]) => ({ moduleCode, actions }));
    const response = await fetch(`/api/enterprise/${organizationId}/administration/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, label: data.get("label"), description: data.get("description"), capabilities: selectedCapabilities, isActive: true }),
    });
    setMessage(await responseMessage(response, copy.roleCreated, copy.roleError));
    if (response.ok) { form.reset(); setCapabilities({}); router.refresh(); }
  }

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(`/api/enterprise/${organizationId}/administration/role-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: data.get("memberId"), roleId: data.get("roleId"), action: data.get("action"), reason: data.get("reason") }),
    });
    setMessage(await responseMessage(response, copy.assigned, copy.assignmentError));
    if (response.ok) router.refresh();
  }

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/enterprise/${organizationId}/administration/permission-simulation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: data.get("userId"), moduleCode: data.get("moduleCode"), action: data.get("action") }),
    });
    const body = (await response.json().catch(() => null)) as { simulation?: { allowed: boolean; reasonCode: string; reason: string }; message?: string } | null;
    setSimulation(body?.simulation || null);
    setMessage(body?.message || (response.ok ? copy.simulated : copy.simulationError));
  }

  async function saveApprovalPolicy() {
    const allowedCodes = new Set(visibleModules.map((module) => normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode)));
    const payload = selfApprovalModules.filter((code) => allowedCodes.has(normalizeEnterpriseModuleCode(code))).map(normalizeEnterpriseModuleCode);
    const response = await fetch(`/api/enterprise/${organizationId}/administration/approval-policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selfApprovalModuleCodes: payload }),
    });
    setMessage(await responseMessage(response, copy.policySaved, copy.policyError));
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-5">
      {message ? <p role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{message}</p> : null}
      <EnterpriseAdminListToolbar search={roleSearch} onSearchChange={(value) => { setRoleSearch(value); setRolePage(1); }} searchPlaceholder={english ? "Find a role or permission code…" : "Rechercher un rôle ou son code…"}
        filters={[{ value: "ALL", label: english ? "All" : "Tous", count: roles.length }, { value: "ACTIVE", label: english ? "Active" : "Actifs", count: roles.filter((role) => role.isActive).length }, { value: "INACTIVE", label: english ? "Inactive" : "Inactifs", count: roles.filter((role) => !role.isActive).length }, { value: "SYSTEM", label: english ? "System" : "Système", count: roles.filter((role) => role.isSystem).length }]}
        filter={roleFilter} onFilterChange={(value) => { setRoleFilter(value); setRolePage(1); }} resultCount={filteredRoles.length} locale={locale}>
        <EnterpriseAdminExportMenu model={roleReport} locale={locale} />
      </EnterpriseAdminListToolbar>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {pageRoles.map((role) => {
          const roleModules = Array.isArray(role.modulesJson) ? role.modulesJson.filter((item): item is string => typeof item === "string") : [];
          return (
            <article key={role.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-black text-dtsc-ink">{english ? role.labelEn : role.labelFr}</p></div>
                <StatusBadge tone={role.isSystem ? "info" : role.isActive ? "success" : "neutral"}>{role.isSystem ? copy.system : role.isActive ? copy.active : copy.inactive}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-dtsc-muted">{(english ? role.descriptionEn : role.descriptionFr) || copy.noDescription}</p>
              <p className="mt-3 text-xs font-bold text-dtsc-muted">{roleModules.length} {copy.services} · {role.assignments.length} {copy.assignments}</p>
              <button type="button" onClick={() => setEditingRole(role)} className="mt-2 min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-black text-dtsc-ink">{english ? "Details / edit" : "Détails / modifier"}</button>
            </article>
          );
        })}
      </div>
      <EnterpriseAdminPagination page={rolePage} pageCount={rolePageCount} onPageChange={setRolePage} locale={locale} />

      {editingRole && <div role="dialog" aria-modal="true" aria-label={english ? "Edit role" : "Modifier le rôle"} className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3">
        <form onSubmit={saveRole} className="max-h-[92dvh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-2xl">
          <h3 className="text-lg font-black text-dtsc-ink">{english ? "Edit role" : "Modifier le rôle"} · {editingRole.code}</h3>
          <p className="text-xs text-dtsc-muted">{editingRole.isSystem ? (english ? "System role: technical permissions and archiving are protected." : "Rôle système : les permissions techniques et l’archivage sont protégés.") : (english ? "Business permissions remain unchanged. Use controlled assignments below for members." : "Les permissions métier restent inchangées. Utilisez les affectations contrôlées ci-dessous pour les membres.")}</p>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-dtsc-muted">Français<Input name="labelFr" required defaultValue={editingRole.labelFr} /></label><label className="text-xs font-bold text-dtsc-muted">English<Input name="labelEn" required defaultValue={editingRole.labelEn} /></label></div>
          <label className="block text-xs font-bold text-dtsc-muted">{english ? "Description (French)" : "Description (français)"}<Input name="descriptionFr" defaultValue={editingRole.descriptionFr || ""} /></label>
          <label className="block text-xs font-bold text-dtsc-muted">{english ? "Description (English)" : "Description (anglais)"}<Input name="descriptionEn" defaultValue={editingRole.descriptionEn || ""} /></label>
          {!editingRole.isSystem && <label className="block text-xs font-bold text-dtsc-muted">{english ? "Status" : "Statut"}<select name="isActive" defaultValue={editingRole.isActive ? "true" : "false"} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="true">{copy.active}</option><option value="false">{copy.inactive}</option></select></label>}
          {editingRole.isSystem && <input type="hidden" name="isActive" value={String(editingRole.isActive)} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingRole(null)}>{english ? "Cancel" : "Annuler"}</Button><Button type="submit">{english ? "Save changes" : "Enregistrer"}</Button></div>
        </form>
      </div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createRole} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label={copy.newRole}>
          <h3 className="font-black text-dtsc-ink">{copy.newRole}</h3>
          <p className="mt-1 text-sm text-dtsc-muted">{copy.chooseCapabilitiesHelp}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input name="label" placeholder={copy.roleName} required />
            <Input name="description" placeholder={copy.roleDescription} />
          </div>
          <fieldset className="mt-5 space-y-3">
            <legend className="text-sm font-black text-dtsc-ink">{copy.chooseCapabilities}</legend>
            {visibleModules.map((module) => {
              const code = normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode);
              return <div key={module.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
                <p className="font-bold text-dtsc-ink">{english ? module.labelEn : module.labelFr}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {guidedActions.map((action) => <label key={action} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-dtsc-ink hover:bg-dtsc-surface"><input type="checkbox" checked={(capabilities[code] || []).includes(action)} onChange={() => toggleCapability(code, action)} />{copy[action]}</label>)}
                </div>
              </div>;
            })}
          </fieldset>
          <Button type="submit" className="mt-4" disabled={!Object.values(capabilities).some((actions) => actions.length)}>{copy.createRole}</Button>
        </form>

        <div className="space-y-4">
          <form onSubmit={assignRole} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label={copy.assignment}>
            <h3 className="font-black text-dtsc-ink">{copy.assignment}</h3>
            <label className="mt-4 block text-xs font-black text-dtsc-muted">{copy.collaborator}
              <select name="memberId" required className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
                <option value="">{copy.select}</option>{members.filter((member) => member.status === "ACTIVE").map((member) => <option key={member.id} value={member.id}>{member.user.name} — {member.positionTitle || member.role}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-xs font-black text-dtsc-muted">{copy.role}
              <select name="roleId" required className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
                <option value="">{copy.select}</option>{roles.filter((role) => role.isActive).map((role) => <option key={role.id} value={role.id}>{english ? role.labelEn : role.labelFr}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-xs font-black text-dtsc-muted">{copy.action}
              <select name="action" className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="ASSIGN">{copy.assign}</option><option value="REVOKE">{copy.revoke}</option></select>
            </label>
            <Input className="mt-3" name="reason" placeholder={copy.reason} />
            <Button type="submit" className="mt-4">{copy.apply}</Button>
          </form>

          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4" aria-labelledby="approval-policy-title">
            <h3 id="approval-policy-title" className="font-black text-dtsc-ink">{copy.overrideTitle}</h3>
            <p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.overrideHelp}</p>
            <div className="mt-3 grid gap-2">
              {visibleModules.map((module) => {
                const code = normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode);
                return <label key={module.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" disabled={policyLoading} checked={selfApprovalModules.includes(code)} onChange={() => toggleSelfApproval(code)} />{english ? module.labelEn : module.labelFr}</label>;
              })}
            </div>
            <Button type="button" variant="outline" className="mt-4" disabled={policyLoading} onClick={() => void saveApprovalPolicy()}>{copy.saveOverride}</Button>
          </section>
        </div>
      </div>

      <form onSubmit={simulate} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label={copy.simulation}>
        <h3 className="font-black text-dtsc-ink">{copy.simulation}</h3>
        <p className="mt-1 text-sm text-dtsc-muted">{copy.simulationHelp}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <select name="userId" required className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="">{copy.collaborator}</option>{members.filter((member) => member.status === "ACTIVE").map((member) => <option key={member.id} value={member.user.id}>{member.user.name}</option>)}</select>
          <select name="moduleCode" required className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="">{copy.service}</option>{visibleModules.map((module) => <option key={module.id} value={normalizeEnterpriseModuleCode(module.canonicalCode || module.moduleCode)}>{english ? module.labelEn : module.labelFr}</option>)}</select>
          <select name="action" className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{guidedActions.map((action) => <option key={action} value={action}>{copy[action]}</option>)}</select>
          <Button type="submit">{copy.simulate}</Button>
        </div>
        {simulation ? <p className="mt-4 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-ink"><strong>{simulation.allowed ? copy.allowed : copy.denied}</strong> — {simulation.reason}</p> : null}
      </form>
    </div>
  );
}

export function EnterpriseSecurityPolicyPanel({ organizationId, policy }: { organizationId: string; policy: EnterpriseSecurityPolicyItem }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/enterprise/${organizationId}/administration/security`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionIdleMinutes: data.get("sessionIdleMinutes"), invitationExpiryHours: data.get("invitationExpiryHours"), maxPendingInvitations: data.get("maxPendingInvitations"),
        requireApprovedDomains: data.get("requireApprovedDomains") === "on", allowedEmailDomains: listFromText(data.get("allowedEmailDomains")), defaultInvitationRole: data.get("defaultInvitationRole"),
        requireInvitationApproval: data.get("requireInvitationApproval") === "on", requireMfa: data.get("requireMfa") === "on", sensitiveExportApproval: data.get("sensitiveExportApproval") === "on",
      }),
    });
    setMessage(await responseMessage(response));
    if (response.ok) router.refresh();
  }
  const domains = Array.isArray(policy.allowedEmailDomainsJson) ? policy.allowedEmailDomainsJson.filter((item): item is string => typeof item === "string").join("\n") : "";
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      {message ? <p role="status" className="rounded-xl bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-black text-dtsc-muted">Inactivité (minutes)<Input name="sessionIdleMinutes" type="number" min="5" max="10080" defaultValue={policy.sessionIdleMinutes} /></label><label className="text-xs font-black text-dtsc-muted">Expiration invitation (heures)<Input name="invitationExpiryHours" type="number" min="1" max="2160" defaultValue={policy.invitationExpiryHours} /></label><label className="text-xs font-black text-dtsc-muted">Invitations en attente max<Input name="maxPendingInvitations" type="number" min="1" max="10000" defaultValue={policy.maxPendingInvitations} /></label></div>
      <label className="block text-xs font-black text-dtsc-muted">Domaines e-mail autorisés<textarea name="allowedEmailDomains" defaultValue={domains} className="mt-1 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="requireApprovedDomains" type="checkbox" defaultChecked={policy.requireApprovedDomains} />Restreindre les domaines</label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="requireInvitationApproval" type="checkbox" defaultChecked={policy.requireInvitationApproval} />Approuver les invitations</label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="requireMfa" type="checkbox" defaultChecked={policy.requireMfa} />Exiger MFA</label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input name="sensitiveExportApproval" type="checkbox" defaultChecked={policy.sensitiveExportApproval} />Approuver exports sensibles</label>
      </div>
      <label className="block text-xs font-black text-dtsc-muted">Rôle d’invitation par défaut<select name="defaultInvitationRole" defaultValue={policy.defaultInvitationRole} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="MEMBER">Collaborateur</option><option value="MANAGER">Responsable</option><option value="GUEST">Invité</option></select></label>
      <Button type="submit">Enregistrer la politique</Button>
    </form>
  );
}

export function EnterpriseAuditPanel({ organizationId, items }: { organizationId: string; items: EnterpriseAuditItem[] }) {
  if (!items.length) return <EmptyState compact title="Aucune activité administrative" description="Les futures mutations administratives apparaîtront ici avec leur reason code." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3"><p className="text-sm text-dtsc-muted">Les secrets, jetons, OTP et données de carte ne sont jamais affichés.</p><a href={`/api/enterprise/${organizationId}/administration/audit/export`} className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-3 text-sm font-black text-dtsc-blue">Exporter l’audit</a></div>
      <div className="overflow-x-auto rounded-2xl border border-dtsc-border"><table className="min-w-[780px] w-full text-left text-sm"><thead className="bg-dtsc-page text-xs uppercase text-dtsc-muted"><tr><th className="p-3">Date</th><th className="p-3">Action</th><th className="p-3">Objet</th><th className="p-3">Résultat</th><th className="p-3">Reason code</th><th className="p-3">Risque</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-dtsc-border"><td className="p-3">{new Date(item.createdAt).toLocaleString()}</td><td className="p-3 font-bold text-dtsc-ink">{item.action}</td><td className="p-3 text-dtsc-muted">{item.entity}{item.entityId ? ` · ${item.entityId}` : ""}</td><td className="p-3"><StatusBadge tone={item.result === "SUCCESS" ? "success" : item.result === "DENIED" ? "warning" : "danger"}>{item.result}</StatusBadge></td><td className="p-3 text-dtsc-muted">{item.reasonCode || "—"}</td><td className="p-3 text-dtsc-muted">{item.riskLevel || "—"}</td></tr>)}</tbody></table></div>
    </div>
  );
}
