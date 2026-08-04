"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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

function listFromText(value: FormDataEntryValue | null) {
  return String(value || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { message?: string; reason?: string } | null;
  return body?.message || body?.reason || (response.ok ? "Action enregistrée." : "Action impossible.");
}

export function EnterpriseRolesPermissionsPanel({ organizationId, roles, members, modules }: { organizationId: string; roles: EnterpriseOrganizationRoleItem[]; members: EnterpriseMemberItem[]; modules: EnterpriseModuleItem[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [simulation, setSimulation] = useState<{ allowed: boolean; reasonCode: string; reason: string } | null>(null);

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(`/api/enterprise/${organizationId}/administration/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: data.get("code"),
        labelFr: data.get("labelFr"),
        labelEn: data.get("labelEn"),
        descriptionFr: data.get("descriptionFr"),
        descriptionEn: data.get("descriptionEn"),
        permissions: listFromText(data.get("permissions")),
        modules: listFromText(data.get("modules")),
        isActive: true,
      }),
    });
    setMessage(await responseMessage(response));
    if (response.ok) { form.reset(); router.refresh(); }
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
    setMessage(await responseMessage(response));
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
    setMessage(body?.message || (response.ok ? "Simulation terminée sans modifier les permissions." : "Simulation impossible."));
  }

  return (
    <div className="space-y-5">
      {message ? <p role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-ink">{message}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const permissions = Array.isArray(role.permissionsJson) ? role.permissionsJson.filter((item): item is string => typeof item === "string") : [];
          return (
            <article key={role.id} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-black text-dtsc-ink">{role.labelFr}</p><p className="text-xs text-dtsc-muted">{role.code}</p></div>
                <StatusBadge tone={role.isSystem ? "info" : role.isActive ? "success" : "neutral"}>{role.isSystem ? "SYSTÈME" : role.isActive ? "ACTIF" : "INACTIF"}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-dtsc-muted">{role.descriptionFr || "Rôle d’organisation sans description."}</p>
              <p className="mt-3 text-xs font-bold text-dtsc-muted">{permissions.length} permission(s) · {role.assignments.length} affectation(s)</p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createRole} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label="Créer un rôle d'organisation">
          <h3 className="font-black text-dtsc-ink">Nouveau rôle personnalisé</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input name="code" placeholder="CODE_ROLE" required />
            <Input name="labelFr" placeholder="Libellé français" required />
            <Input name="labelEn" placeholder="English label" required />
            <Input name="descriptionFr" placeholder="Description" />
          </div>
          <label className="mt-3 block text-xs font-black text-dtsc-muted">Permissions, séparées par virgule ou ligne
            <textarea name="permissions" className="mt-1 min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" placeholder="enterprise.reports.view&#10;enterprise.finance.view" />
          </label>
          <label className="mt-3 block text-xs font-black text-dtsc-muted">Modules autorisés
            <textarea name="modules" className="mt-1 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" placeholder="REPORTS, FINANCE_BUDGETS" />
          </label>
          <Button type="submit" className="mt-4">Créer le rôle</Button>
        </form>

        <form onSubmit={assignRole} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label="Affecter un rôle">
          <h3 className="font-black text-dtsc-ink">Affectation contrôlée</h3>
          <label className="mt-4 block text-xs font-black text-dtsc-muted">Collaborateur
            <select name="memberId" required className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
              <option value="">Sélectionner</option>{members.filter((member) => member.status === "ACTIVE").map((member) => <option key={member.id} value={member.id}>{member.user.name} — {member.positionTitle || member.role}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-xs font-black text-dtsc-muted">Rôle
            <select name="roleId" required className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
              <option value="">Sélectionner</option>{roles.filter((role) => role.isActive).map((role) => <option key={role.id} value={role.id}>{role.labelFr}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-xs font-black text-dtsc-muted">Action
            <select name="action" className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="ASSIGN">Affecter</option><option value="REVOKE">Révoquer</option></select>
          </label>
          <Input className="mt-3" name="reason" placeholder="Motif auditable" />
          <Button type="submit" className="mt-4">Appliquer</Button>
        </form>
      </div>

      <form onSubmit={simulate} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-label="Simuler des permissions">
        <h3 className="font-black text-dtsc-ink">Simulation sans mutation</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <select name="userId" required className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="">Collaborateur</option>{members.filter((member) => member.status === "ACTIVE").map((member) => <option key={member.id} value={member.user.id}>{member.user.name}</option>)}</select>
          <select name="moduleCode" required className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="">Module</option>{modules.filter((module) => module.registryKnown).map((module) => <option key={module.id} value={module.canonicalCode || module.moduleCode}>{module.labelFr}</option>)}</select>
          <select name="action" className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink"><option value="read">Lire</option><option value="submit">Soumettre</option><option value="write">Modifier</option><option value="manage">Administrer</option></select>
          <Button type="submit">Simuler</Button>
        </div>
        {simulation ? <p className="mt-4 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-ink"><strong>{simulation.allowed ? "Autorisé" : "Refusé"}</strong> — {simulation.reasonCode} — {simulation.reason}</p> : null}
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
