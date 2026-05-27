"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Building2, ShieldCheck } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type ClientOrganization = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  industry: string | null;
  country: string | null;
  city: string | null;
  email: string | null;
  members: Array<{ id: string; role: string; status: string; user: { id: string; name: string; email: string } }>;
  subscriptions: Array<{ id: string; status: string; plan: { name: string } }>;
};

type AdminUserOption = { id: string; name: string; email: string; role: string };
type PlanOption = { id: string; name: string; slug: string };

export function ClientOrganizationsPanel({
  organizations,
  users,
  plans,
}: {
  organizations: ClientOrganization[];
  users: AdminUserOption[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const list = useSmartList({
    items: organizations,
    pageSize: 8,
    getSearchText: (organization) => `${organization.name} ${organization.slug || ""} ${organization.industry || ""} ${organization.country || ""} ${organization.status}`,
  });
  const activeUsers = useMemo(() => users.filter((user) => user.role !== "CLIENT" || user.email), [users]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/admin/client-organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Entreprise cliente créée." : body?.message || "Création impossible.");
    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function updateOrganization(organizationId: string, payload: Record<string, string>) {
    const response = await fetch(`/api/admin/client-organizations/${organizationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Action enregistrée." : body?.message || "Action impossible.");
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-4 text-sm font-bold leading-6 text-dtsc-ink">
        DTSC gère l&apos;abonnement et l&apos;activation de l&apos;espace client, mais ne peut pas accéder aux données internes privées de cette entreprise.
      </div>

      <form onSubmit={createOrganization} className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2 xl:grid-cols-3">
        <Input name="name" placeholder="Nom de l'entreprise" required />
        <Input name="slug" placeholder="slug-entreprise" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <Input name="industry" placeholder="Secteur d'activité" />
        <Input name="country" placeholder="Pays" />
        <Input name="city" placeholder="Ville" />
        <Input name="email" type="email" placeholder="Email principal" />
        <Input name="phone" placeholder="Téléphone" />
        <Input name="address" placeholder="Adresse" />
        <select name="status" defaultValue="DRAFT" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
          <option value="DRAFT">Brouillon</option>
          <option value="ACTIVE">Actif</option>
          <option value="SUSPENDED">Suspendu</option>
          <option value="ARCHIVED">Archivé</option>
        </select>
        <select name="adminUserId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
          <option value="">Désigner un admin entreprise existant</option>
          {activeUsers.map((user) => (
            <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
          ))}
        </select>
        <select name="planId" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
          <option value="">Plan à lier plus tard</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
        <textarea name="notes" placeholder="Notes internes DTSC" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink xl:col-span-3" />
        <div className="xl:col-span-3">
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
            <Building2 className="h-4 w-4" />
            Créer l&apos;entreprise cliente
          </Button>
        </div>
      </form>

      <ListControls
        query={list.query}
        onQueryChange={list.setQuery}
        page={list.page}
        pageCount={list.pageCount}
        totalCount={list.totalCount}
        filteredCount={list.filteredCount}
        placeholder="Rechercher une entreprise cliente..."
        onPageChange={list.setPage}
      />

      <div className="grid gap-3">
        {list.paginatedItems.map((organization) => {
          const adminMembers = organization.members.filter((member) => member.role === "ADMIN_ENTREPRISE" && member.status === "ACTIVE");
          return (
            <article key={organization.id} className="dtsc-glass-list-item rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{organization.status}</p>
                  <h3 className="mt-1 text-xl font-black text-dtsc-ink">{organization.name}</h3>
                  <p className="mt-1 text-sm text-dtsc-muted">{[organization.industry, organization.city, organization.country].filter(Boolean).join(" · ") || "Informations générales à compléter."}</p>
                  <p className="mt-2 text-xs font-bold text-dtsc-muted">Admin entreprise: {adminMembers.map((member) => member.user.name).join(", ") || "Non désigné"}</p>
                  <p className="text-xs font-bold text-dtsc-muted">Abonnement: {organization.subscriptions[0]?.plan.name || "Aucun plan actif"}</p>
                </div>
                <ActionMenu
                  label="Actions entreprise"
                  items={[
                    { key: "activate", label: "Activer", icon: ShieldCheck, onSelect: () => updateOrganization(organization.id, { action: "set_status", status: "ACTIVE" }) },
                    { key: "suspend", label: "Suspendre", icon: ShieldCheck, onSelect: () => updateOrganization(organization.id, { action: "set_status", status: "SUSPENDED" }) },
                    { key: "archive", label: "Archiver", icon: ShieldCheck, destructive: true, onSelect: () => updateOrganization(organization.id, { action: "set_status", status: "ARCHIVED" }) },
                  ]}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {users.slice(0, 8).map((user) => (
                  <Button key={user.id} type="button" variant="outline" size="sm" onClick={() => updateOrganization(organization.id, { action: "grant_admin", userId: user.id })} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
                    Admin: {user.name}
                  </Button>
                ))}
                {adminMembers.map((member) => (
                  <Button key={member.id} type="button" variant="outline" size="sm" onClick={() => updateOrganization(organization.id, { action: "revoke_admin", userId: member.user.id })} className="rounded-xl border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200">
                    Retirer {member.user.name}
                  </Button>
                ))}
              </div>
            </article>
          );
        })}
        {!list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucune entreprise cliente trouvée.</p>}
      </div>
      {message && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
    </section>
  );
}
