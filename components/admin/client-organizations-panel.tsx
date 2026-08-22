"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, CreditCard, Edit3, Layers3, ShieldCheck, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { ReferenceCombobox } from "@/components/ui/reference-combobox";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { translateClientOrganizations, type ClientOrganizationsLocale } from "@/lib/console/client-organizations-i18n";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type ClientOrganization = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  industry: string | null;
  sectorId: string | null;
  sectorCode: string | null;
  businessSector?: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
  country: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  timezone: string | null;
  notes: string | null;
  members: Array<{ id: string; role: string; status: string; user: { id: string; name: string; email: string } }>;
  subscriptions: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    expiresAt: string | null;
    trialEndsAt: string | null;
    plan: { id: string; name: string; slug: string };
  }>;
};

type AdminUserOption = { id: string; name: string; email: string; role: string };
type PlanOption = { id: string; name: string; slug: string };
type BusinessSectorOption = {
  id: string;
  code: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  icon: string | null;
  color: string | null;
};
type TemplatePreview = {
  sector: { id: string; code: string; labelFr: string; labelEn: string; descriptionFr: string | null };
  modules: Array<{ code: string; labelFr: string; category: string; isCore: boolean }>;
  positions: Array<{ code: string; labelFr: string; isKeyPosition: boolean }>;
  departments: Array<{ code: string; labelFr: string }>;
  activityBlocks: Array<{ code: string; labelFr: string; targetModuleCode: string | null }>;
};
type OrganizationUpdateBody = {
  message?: string;
  error?: string;
  reasonCode?: string;
  field?: string | null;
};
type OrganizationUpdateResult = { ok: boolean; message: string };

const ADMIN_ROLES = new Set(["ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "OWNER"]);

export function ClientOrganizationsPanel({
  organizations,
  users,
  plans,
  sectors,
}: {
  organizations: ClientOrganization[];
  users: AdminUserOption[];
  plans: PlanOption[];
  sectors: BusinessSectorOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [locale, setLocale] = useState<ClientOrganizationsLocale>("fr");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [sectorQuery, setSectorQuery] = useState("");
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createAdminUserId, setCreateAdminUserId] = useState("");
  const [createAdminReason, setCreateAdminReason] = useState("");
  const [editingOrganization, setEditingOrganization] = useState<ClientOrganization | null>(null);
  const [subscriptionOrganization, setSubscriptionOrganization] = useState<ClientOrganization | null>(null);
  const [organizationToDelete, setOrganizationToDelete] = useState<ClientOrganization | null>(null);
  useToastMessage(message);
  const list = useSmartList({
    items: organizations,
    pageSize: 8,
    getSearchText: (organization) => `${organization.name} ${organization.slug || ""} ${organization.industry || ""} ${organization.country || ""} ${organization.status}`,
  });
  const activeUsers = useMemo(() => users.filter((user) => user.role !== "CLIENT" || user.email), [users]);
  const filteredSectors = useMemo(() => {
    const query = sectorQuery.trim().toLowerCase();
    if (!query) {
      return sectors;
    }
    return sectors.filter((sector) => `${sector.labelFr} ${sector.labelEn} ${sector.code}`.toLowerCase().includes(query));
  }, [sectorQuery, sectors]);
  const t = (key: Parameters<typeof translateClientOrganizations>[1]) => translateClientOrganizations(locale, key);

  useEffect(() => {
    setLocale(document.documentElement.lang === "en" ? "en" : "fr");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSectorId) {
      setTemplatePreview(null);
      return;
    }
    fetch(`/api/admin/sector-templates?sectorId=${encodeURIComponent(selectedSectorId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((body: { preview?: TemplatePreview } | null) => {
        if (!cancelled) {
          setTemplatePreview(body?.preview || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTemplatePreview(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSectorId]);

  function resetCreateAdminInvitation() {
    setCreateAdminUserId("");
    setCreateAdminReason("");
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    resetCreateAdminInvitation();
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    if (createAdminUserId) {
      const normalizedReason = createAdminReason.trim();
      if (normalizedReason.length < 3) {
        setMessage(t("adminReasonRequired"));
        return;
      }
      payload.adminUserId = createAdminUserId;
      payload.adminReason = normalizedReason;
    } else {
      delete payload.adminUserId;
      delete payload.adminReason;
    }
    const response = await fetch("/api/admin/client-organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as OrganizationUpdateBody | null;
    setMessage(response.ok
      ? createAdminUserId ? t("companyCreatedWithAdmin") : t("companyCreated")
      : resolveUpdateError(body, response.status));
    if (response.ok) {
      event.currentTarget.reset();
      closeCreateDialog();
      setSelectedSectorId("");
      setSectorQuery("");
      setTemplatePreview(null);
      router.refresh();
    }
  }

  function resolveUpdateError(body: OrganizationUpdateBody | null, responseStatus: number) {
    if (body?.reasonCode === "ADMIN_ALREADY_ACTIVE") return t("adminAlreadyActive");
    if (body?.reasonCode === "ADMIN_INVITATION_ALREADY_PENDING") return t("adminInvitationAlreadyPending");
    if (body?.reasonCode === "ADMIN_TARGET_PRIVILEGED") return t("adminTargetPrivileged");
    if (body?.reasonCode === "VALIDATION_ERROR" && (body.field === "reason" || body.field === "adminReason")) return t("adminReasonRequired");
    if (body?.reasonCode === "VALIDATION_ERROR" || body?.error === "Invalid payload" || responseStatus === 400) return body?.message || t("invalidForm");
    return body?.message || t("actionImpossible");
  }

  async function requestOrganizationUpdate(organizationId: string, payload: Record<string, string>): Promise<OrganizationUpdateResult> {
    const response = await fetch(`/api/admin/client-organizations/${organizationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as OrganizationUpdateBody | null;
    return response.ok
      ? { ok: true, message: t("actionSaved") }
      : { ok: false, message: resolveUpdateError(body, response.status) };
  }

  async function updateOrganization(organizationId: string, payload: Record<string, string>) {
    setMessage("");
    const result = await requestOrganizationUpdate(organizationId, payload);
    setMessage(result.message);
    if (result.ok) {
      router.refresh();
    }
    return result.ok;
  }

  async function inviteOrganizationAdmin(organizationId: string, userId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (!userId || normalizedReason.length < 3) {
      setMessage(t("adminReasonRequired"));
      return false;
    }
    setMessage("");
    const result = await requestOrganizationUpdate(organizationId, {
      action: "grant_admin",
      userId,
      reason: normalizedReason,
    });
    setMessage(result.ok ? t("adminInvitationSent") : result.message);
    if (result.ok) {
      setEditingOrganization(null);
      router.refresh();
    }
    return result.ok;
  }

  async function submitOrganizationEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOrganization) {
      return;
    }
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    delete payload.userId;

    const organizationResult = await requestOrganizationUpdate(editingOrganization.id, { ...payload, action: "update" });
    if (!organizationResult.ok) {
      setMessage(organizationResult.message);
      return;
    }

    if (payload.planId || editingOrganization.subscriptions[0]) {
      const subscriptionResult = await requestOrganizationUpdate(editingOrganization.id, {
        action: "update_subscription",
        planId: payload.planId || "",
        subscriptionStatus: payload.subscriptionStatus || "ACTIVE",
        startedAt: payload.startedAt || "",
        expiresAt: payload.expiresAt || "",
        trialEndsAt: payload.trialEndsAt || "",
      });
      if (!subscriptionResult.ok) {
        setMessage(`${t("companyUpdatedSubscriptionFailed")} ${subscriptionResult.message}`);
        router.refresh();
        return;
      }
    }

    setMessage(t("companyUpdated"));
    setEditingOrganization(null);
    router.refresh();
  }

  async function submitSubscriptionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionOrganization) {
      return;
    }
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const saved = await updateOrganization(subscriptionOrganization.id, { ...payload, action: "update_subscription" });
    if (saved) {
      setSubscriptionOrganization(null);
    }
  }

  async function confirmDeleteOrganization() {
    if (!organizationToDelete) {
      return;
    }
    const deleted = await updateOrganization(organizationToDelete.id, {
      action: "soft_delete",
      reason: `Suppression logique depuis Administration DTSC: ${organizationToDelete.name}`,
    });
    if (deleted) {
      setOrganizationToDelete(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-4 text-sm font-bold leading-6 text-dtsc-ink">
        DTSC gère l&apos;abonnement et l&apos;activation de l&apos;espace client, mais ne peut pas accéder aux données internes privées de cette entreprise.
      </div>

      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-black text-dtsc-ink">Nouvelle entreprise cliente</h3>
            <p className="mt-1 text-sm text-dtsc-muted">Créez l&apos;organisation, son secteur, son administrateur initial et son plan.</p>
          </div>
          <Button type="button" onClick={() => { resetCreateAdminInvitation(); setCreateOpen(true); }} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
            <Building2 className="h-4 w-4" />
            Créer l&apos;entreprise cliente
          </Button>
        </div>
      </div>

      <Dialog open={createOpen} title="Créer une entreprise cliente" description="DTSC crée l'espace client, sélectionne le secteur et peut appliquer un modèle sectoriel sans accéder aux données privées futures." onClose={closeCreateDialog} className="h-[92dvh] max-w-6xl">
      <form onSubmit={createOrganization} className="grid min-w-0 max-w-full gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField label="Nom de l'entreprise" hint="Nom officiel ou commercial qui apparaîtra dans le sélecteur d'espace.">
          <Input name="name" placeholder="Nom de l'entreprise" required />
        </FormField>
        <FormField label="Slug" hint="Identifiant court en minuscules, utilisé pour les URLs et références.">
          <Input name="slug" placeholder="slug-entreprise" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </FormField>
        <FormField label="Secteur d'activité" hint="Choisissez un secteur pour prévisualiser et appliquer le template adapté." className="md:col-span-2 xl:col-span-1">
          <div className="relative min-w-0 max-w-full">
            <input type="hidden" name="sectorId" value={selectedSectorId} />
            <Input
              value={sectorQuery}
              onChange={(event) => {
                setSectorQuery(event.currentTarget.value);
                setSelectedSectorId("");
              }}
              placeholder="Choisir un secteur d'activité"
              aria-label="Secteur d'activité"
            />
            {filteredSectors.length > 0 && (
              <div className="mt-2 max-h-56 max-w-full overflow-y-auto rounded-2xl border border-dtsc-border bg-[color-mix(in_srgb,var(--dtsc-surface)_88%,transparent)] p-2 shadow-[0_18px_55px_rgba(0,23,54,0.14)] backdrop-blur-xl">
                {filteredSectors.slice(0, 8).map((sector) => {
                  const active = selectedSectorId === sector.id;
                  return (
                    <button
                      key={sector.id}
                      type="button"
                      onClick={() => {
                        setSelectedSectorId(sector.id);
                        setSectorQuery(sector.labelFr);
                      }}
                      className={`flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2 text-left transition ${active ? "bg-cyan-400/18 text-cyan-600" : "text-dtsc-ink hover:bg-dtsc-soft"}`}
                    >
                      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: sector.color || "#22d3ee" }} />
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-black">{sector.labelFr}</span>
                        <span className="line-clamp-2 break-words text-xs font-semibold text-dtsc-muted">{sector.descriptionFr || sector.labelEn}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </FormField>
        <FormField label="Pays" hint="Pays principal de l'entreprise."><Input name="country" placeholder="Pays" /></FormField>
        <FormField label="Ville" hint="Ville ou zone principale."><Input name="city" placeholder="Ville" /></FormField>
        <FormField label="Email principal" hint="Adresse administrative de contact."><Input name="email" type="email" placeholder="Email principal" /></FormField>
        <FormField label="Téléphone" hint="Numéro administratif de contact."><Input name="phone" placeholder="Téléphone" /></FormField>
        <FormField label="Adresse" hint="Adresse physique ou administrative."><Input name="address" placeholder="Adresse" /></FormField>
        <FormField label="Statut" hint="État administratif de l'espace client.">
          <select name="status" defaultValue="DRAFT" className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
            <option value="DRAFT">Brouillon</option>
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
            <option value="ARCHIVED">Archivé</option>
          </select>
        </FormField>

        <section className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 md:col-span-2 xl:col-span-3">
          <FormField label={t("createAdminLabel")} hint={t("createAdminHint")}>
            <ReferenceCombobox
              key={createOpen ? "create-admin-open" : "create-admin-closed"}
              name="adminUserId"
              options={activeUsers.map((user) => ({ id: user.id, label: `${user.name} · ${user.email}` }))}
              allowCustom={false}
              onValueChange={(value) => {
                setCreateAdminUserId(value);
                setCreateAdminReason("");
              }}
            />
          </FormField>
          {createAdminUserId ? (
            <>
              <FormField label={t("reasonLabel")} hint={t("reasonHint")} required>
                <textarea
                  name="adminReason"
                  value={createAdminReason}
                  onChange={(event) => setCreateAdminReason(event.currentTarget.value)}
                  placeholder={t("reasonPlaceholder")}
                  aria-label={t("reasonLabel")}
                  aria-required="true"
                  required
                  minLength={3}
                  maxLength={500}
                  className="min-h-28 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </FormField>
              <p className="min-w-0 break-words text-sm leading-6 text-dtsc-muted">{t("acceptanceHint")}</p>
            </>
          ) : null}
        </section>

        <FormField label="Plan initial" hint="Plan d'abonnement à rattacher maintenant ou plus tard.">
          <select name="planId" className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
            <option value="">Plan à lier plus tard</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Notes internes DTSC" hint="Notes administratives visibles uniquement côté DTSC." className="xl:col-span-3">
          <textarea name="notes" placeholder="Notes internes DTSC" className="min-h-24 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
        {templatePreview && (
          <div className="min-w-0 max-w-full rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 xl:col-span-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Aperçu du modèle sectoriel</p>
                <h3 className="mt-1 break-words text-lg font-black text-dtsc-ink">{templatePreview.sector.labelFr}</h3>
                <p className="mt-1 max-w-3xl break-words text-sm text-dtsc-muted">{templatePreview.sector.descriptionFr}</p>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs font-black text-dtsc-ink">
                <input type="checkbox" name="applySectorTemplate" value="true" className="h-4 w-4 accent-cyan-500" />
                Appliquer après création
              </label>
            </div>
            <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-4">
              <PreviewColumn title="Modules" items={templatePreview.modules.slice(0, 8).map((item) => item.labelFr)} moreCount={Math.max(0, templatePreview.modules.length - 8)} />
              <PreviewColumn title="Postes" items={templatePreview.positions.slice(0, 6).map((item) => item.labelFr)} moreCount={Math.max(0, templatePreview.positions.length - 6)} />
              <PreviewColumn title="Départements" items={templatePreview.departments.slice(0, 5).map((item) => item.labelFr)} moreCount={Math.max(0, templatePreview.departments.length - 5)} />
              <PreviewColumn title="Activités" items={templatePreview.activityBlocks.slice(0, 6).map((item) => item.labelFr)} moreCount={Math.max(0, templatePreview.activityBlocks.length - 6)} />
            </div>
          </div>
        )}
        <div className="flex min-w-0 justify-end xl:col-span-3" data-responsive-actions>
          <Button disabled={Boolean(createAdminUserId) && createAdminReason.trim().length < 3} className="w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736] sm:w-auto">
            <Building2 className="h-4 w-4" />
            Créer l&apos;entreprise cliente
          </Button>
        </div>
      </form>
      </Dialog>

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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {list.paginatedItems.map((organization) => {
          const adminMembers = organization.members.filter((member) => ADMIN_ROLES.has(member.role) && member.status === "ACTIVE");
          const pendingAdminMembers = organization.members.filter((member) => ADMIN_ROLES.has(member.role) && member.status === "INVITED");
          return (
            <article key={organization.id} className="dtsc-glass-list-item min-w-0 max-w-full rounded-2xl p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{organization.status}</p>
                  <h3 className="mt-1 break-words text-xl font-black text-dtsc-ink">{organization.name}</h3>
                  <p className="mt-1 break-words text-sm text-dtsc-muted">{[organization.industry, organization.city, organization.country].filter(Boolean).join(" · ") || "Informations générales à compléter."}</p>
                  <p className="mt-2 break-words text-xs font-bold text-cyan-600">Secteur: {organization.businessSector?.labelFr || organization.industry || "Non défini"}</p>
                  <p className="mt-2 break-words text-xs font-bold text-dtsc-muted">{t("currentAdmin")}: {adminMembers.map((member) => member.user.name).join(", ") || t("noActiveAdmin")}</p>
                  {pendingAdminMembers.length > 0 ? (
                    <p className="mt-1 break-words text-xs font-bold text-amber-600 dark:text-amber-300">
                      {t("pendingInvitation")}: {pendingAdminMembers.map((member) => member.user.name).join(", ")}
                    </p>
                  ) : null}
                  <p className="break-words text-xs font-bold text-dtsc-muted">Abonnement: {organization.subscriptions[0]?.plan.name || "Aucun plan actif"}</p>
                </div>
                <ActionMenu
                  label="Actions entreprise"
                  items={[
                    { key: "activate", label: "Activer", icon: ShieldCheck, onSelect: () => updateOrganization(organization.id, { action: "set_status", status: "ACTIVE" }) },
                    { key: "edit", label: "Modifier l'entreprise", icon: Edit3, onSelect: () => setEditingOrganization(organization) },
                    { key: "subscription", label: "Gérer l'abonnement", icon: CreditCard, onSelect: () => setSubscriptionOrganization(organization) },
                    { key: "suspend", label: "Suspendre", icon: ShieldCheck, onSelect: () => updateOrganization(organization.id, { action: "set_status", status: "SUSPENDED" }) },
                    ...(organization.sectorId ? [{ key: "apply-template", label: "Appliquer le modèle sectoriel", icon: Layers3, onSelect: () => updateOrganization(organization.id, { action: "apply_sector_template", sectorId: organization.sectorId || "" }) }] : []),
                    { key: "archive", label: "Archiver", icon: ShieldCheck, destructive: true, onSelect: () => updateOrganization(organization.id, { action: "set_status", status: "ARCHIVED" }) },
                    { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setOrganizationToDelete(organization) },
                  ]}
                />
              </div>
            </article>
          );
        })}
        {!list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucune entreprise cliente trouvée.</p>}
      </div>
      <OrganizationEditDialog
        organization={editingOrganization}
        users={activeUsers}
        plans={plans}
        sectors={sectors}
        locale={locale}
        onClose={() => setEditingOrganization(null)}
        onSubmit={submitOrganizationEdit}
        onInviteAdmin={inviteOrganizationAdmin}
      />
      <SubscriptionDialog
        organization={subscriptionOrganization}
        plans={plans}
        onClose={() => setSubscriptionOrganization(null)}
        onSubmit={submitSubscriptionEdit}
      />
      <Dialog
        open={Boolean(organizationToDelete)}
        title="Supprimer l'entreprise"
        description={organizationToDelete?.name}
        onClose={() => setOrganizationToDelete(null)}
        className="max-w-lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOrganizationToDelete(null)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="button" onClick={() => void confirmDeleteOrganization()} className="rounded-xl bg-red-600 text-white hover:bg-red-700">
              Supprimer
            </Button>
          </>
        }
      >
        <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800 dark:bg-red-950/30 dark:text-red-200">
          Cette action archive l&apos;entreprise, la retire des listes actives et annule ses abonnements actifs. Les données internes ne sont pas supprimées brutalement afin de préserver l&apos;audit et la traçabilité.
        </p>
      </Dialog>
    </section>
  );
}

function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function OrganizationEditDialog({
  organization,
  users,
  plans,
  sectors,
  locale,
  onClose,
  onSubmit,
  onInviteAdmin,
}: {
  organization: ClientOrganization | null;
  users: AdminUserOption[];
  plans: PlanOption[];
  sectors: BusinessSectorOption[];
  locale: ClientOrganizationsLocale;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInviteAdmin: (organizationId: string, userId: string, reason: string) => Promise<boolean>;
}) {
  const subscription = organization?.subscriptions[0];
  const [selectedAdminUserId, setSelectedAdminUserId] = useState("");
  const [adminReason, setAdminReason] = useState("");
  const [isInvitingAdmin, setIsInvitingAdmin] = useState(false);
  const t = (key: Parameters<typeof translateClientOrganizations>[1]) => translateClientOrganizations(locale, key);

  useEffect(() => {
    setSelectedAdminUserId("");
    setAdminReason("");
    setIsInvitingAdmin(false);
  }, [organization?.id]);

  if (!organization) {
    return <Dialog open={false} title="Modifier l'entreprise" onClose={onClose} />;
  }

  const activeAdmins = organization.members.filter((member) => ADMIN_ROLES.has(member.role) && member.status === "ACTIVE");
  const pendingAdmins = organization.members.filter((member) => ADMIN_ROLES.has(member.role) && member.status === "INVITED");
  const unavailableAdminIds = new Set([...activeAdmins, ...pendingAdmins].map((member) => member.user.id));
  const eligibleAdminOptions = users
    .filter((user) => !unavailableAdminIds.has(user.id))
    .map((user) => ({ id: user.id, label: `${user.name} · ${user.email}` }));

  async function handleAdminInvitation() {
    if (!selectedAdminUserId || adminReason.trim().length < 3) {
      return;
    }
    setIsInvitingAdmin(true);
    try {
      await onInviteAdmin(organization.id, selectedAdminUserId, adminReason);
    } finally {
      setIsInvitingAdmin(false);
    }
  }

  return (
    <Dialog open title="Modifier l'entreprise" description={organization.name} onClose={onClose} className="h-[92dvh] max-w-6xl">
      <form onSubmit={onSubmit} className="grid min-w-0 max-w-full gap-4 md:grid-cols-2">
        <FormField label="Nom de l'entreprise" hint="Nom affiché dans l'espace client."><Input name="name" defaultValue={organization.name} placeholder="Nom de l'entreprise" required /></FormField>
        <FormField label="Slug" hint="Identifiant URL en minuscules."><Input name="slug" defaultValue={organization.slug || ""} placeholder="slug-entreprise" pattern="[a-z0-9]+(-[a-z0-9]+)*" /></FormField>
        <FormField label="Secteur normalisé" hint="Sélectionnez un secteur pour adapter les modules.">
          <select name="sectorId" defaultValue={organization.sectorId || ""} className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
            <option value="">Conserver le secteur actuel</option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>{sector.labelFr}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Secteur libre" hint="Complément métier administratif si nécessaire."><Input name="industry" defaultValue={organization.industry || ""} placeholder="Secteur libre / industrie" /></FormField>
        <FormField label="Pays" hint="Pays principal."><Input name="country" defaultValue={organization.country || ""} placeholder="Pays" /></FormField>
        <FormField label="Ville" hint="Ville ou zone principale."><Input name="city" defaultValue={organization.city || ""} placeholder="Ville" /></FormField>
        <FormField label="Email principal" hint="Email administratif de l'entreprise."><Input name="email" type="email" defaultValue={organization.email || ""} placeholder="Email principal" /></FormField>
        <FormField label="Téléphone" hint="Numéro administratif de l'entreprise."><Input name="phone" defaultValue={organization.phone || ""} placeholder="Téléphone" /></FormField>
        <FormField label="Adresse" hint="Adresse administrative ou physique."><Input name="address" defaultValue={organization.address || ""} placeholder="Adresse" /></FormField>
        <FormField label="Fuseau horaire" hint="Fuseau utilisé pour dates, réunions et notifications."><Input name="timezone" defaultValue={organization.timezone || "Africa/Kinshasa"} placeholder="Fuseau horaire" /></FormField>
        <FormField label="Statut" hint="État opérationnel de l'espace client.">
          <select name="status" defaultValue={organization.status} className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
            <option value="DRAFT">Brouillon</option>
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
            <option value="ARCHIVED">Archivé</option>
          </select>
        </FormField>

        <section className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 md:col-span-2">
          <div className="min-w-0">
            <p className="break-words text-sm font-black text-dtsc-ink">{t("currentAdmin")}: {activeAdmins.map((member) => member.user.name).join(", ") || t("noActiveAdmin")}</p>
            {pendingAdmins.length > 0 ? (
              <p className="mt-1 break-words text-sm font-semibold text-amber-600 dark:text-amber-300">{t("pendingInvitation")}: {pendingAdmins.map((member) => member.user.name).join(", ")}</p>
            ) : null}
          </div>
          <FormField label={t("changeAdminLabel")} hint={t("changeAdminHint")}>
            <ReferenceCombobox
              key={organization.id}
              name="userId"
              options={eligibleAdminOptions}
              allowCustom={false}
              disabled={eligibleAdminOptions.length === 0 || isInvitingAdmin}
              onValueChange={(value) => {
                setSelectedAdminUserId(value);
                setAdminReason("");
              }}
            />
          </FormField>
          {eligibleAdminOptions.length === 0 ? <p className="break-words text-sm font-semibold text-dtsc-muted">{t("noEligibleAdmin")}</p> : null}
          {selectedAdminUserId ? (
            <>
              <FormField label={t("reasonLabel")} hint={t("reasonHint")} required>
                <textarea
                  value={adminReason}
                  onChange={(event) => setAdminReason(event.currentTarget.value)}
                  placeholder={t("reasonPlaceholder")}
                  aria-label={t("reasonLabel")}
                  aria-required="true"
                  minLength={3}
                  maxLength={500}
                  disabled={isInvitingAdmin}
                  className="min-h-28 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60"
                />
              </FormField>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-responsive-actions>
                <p className="min-w-0 break-words text-sm leading-6 text-dtsc-muted">{t("acceptanceHint")}</p>
                <Button
                  type="button"
                  onClick={() => void handleAdminInvitation()}
                  disabled={adminReason.trim().length < 3 || isInvitingAdmin}
                  className="w-full rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 sm:w-auto"
                >
                  {isInvitingAdmin ? t("sendingInvitation") : t("sendInvitation")}
                </Button>
              </div>
            </>
          ) : null}
        </section>

        <section className="min-w-0 max-w-full rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 md:col-span-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Abonnement</p>
          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-4">
            <FormField label="Plan" hint="Plan actif ou à rattacher."><select name="planId" defaultValue={subscription?.plan.id || ""} className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"><option value="">Aucun plan</option>{plans.map((plan) => (<option key={plan.id} value={plan.id}>{plan.name}</option>))}</select></FormField>
            <FormField label="Statut abonnement" hint="État de facturation contrôlé par DTSC."><select name="subscriptionStatus" defaultValue={subscription?.status || "ACTIVE"} className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"><option value="ACTIVE">Actif</option><option value="PENDING_PAYMENT">Paiement en attente</option><option value="PAST_DUE">En retard</option><option value="TRIAL">Essai</option><option value="SUSPENDED">Suspendu</option><option value="EXPIRED">Expiré</option><option value="CANCELED">Annulé</option></select></FormField>
            <FormField label="Début" hint="Date de démarrage de l'abonnement."><Input name="startedAt" type="date" defaultValue={formatDateInput(subscription?.startedAt)} /></FormField>
            <FormField label="Expiration" hint="Date de fin ou renouvellement."><Input name="expiresAt" type="date" defaultValue={formatDateInput(subscription?.expiresAt)} /></FormField>
            <FormField label="Fin d'essai" hint="Date de fin de période d'essai si applicable."><Input name="trialEndsAt" type="date" defaultValue={formatDateInput(subscription?.trialEndsAt)} /></FormField>
          </div>
        </section>
        <FormField label="Notes internes DTSC" hint="Notes administratives non visibles par l'entreprise cliente." className="md:col-span-2">
          <textarea name="notes" defaultValue={organization.notes || ""} placeholder="Notes internes DTSC" className="min-h-28 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
        <div className="flex flex-wrap justify-end gap-3 md:col-span-2" data-responsive-actions>
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Annuler</Button>
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  );
}

function SubscriptionDialog({
  organization,
  plans,
  onClose,
  onSubmit,
}: {
  organization: ClientOrganization | null;
  plans: PlanOption[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const subscription = organization?.subscriptions[0];
  return (
    <Dialog open={Boolean(organization)} title="Gérer l'abonnement" description={organization?.name} onClose={onClose} className="h-[92dvh] max-w-4xl">
      {organization && (
        <form onSubmit={onSubmit} className="grid min-w-0 max-w-full gap-4 md:grid-cols-2">
          <FormField label="Plan" hint="Choisissez le plan que DTSC active pour cette entreprise.">
            <select name="planId" defaultValue={subscription?.plan.id || ""} required className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="">Choisir un plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Statut" hint="Contrôle l'accès aux modules dépendants de l'abonnement.">
            <select name="subscriptionStatus" defaultValue={subscription?.status || "ACTIVE"} className="h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="ACTIVE">Actif</option>
              <option value="PENDING_PAYMENT">Paiement en attente</option>
              <option value="PAST_DUE">En retard</option>
              <option value="TRIAL">Essai</option>
              <option value="SUSPENDED">Suspendu</option>
              <option value="EXPIRED">Expiré</option>
              <option value="CANCELED">Annulé</option>
            </select>
          </FormField>
          <FormField label="Date de début" hint="Début de la période active."><Input name="startedAt" type="date" defaultValue={formatDateInput(subscription?.startedAt)} /></FormField>
          <FormField label="Date d'expiration" hint="Fin de période ou renouvellement attendu."><Input name="expiresAt" type="date" defaultValue={formatDateInput(subscription?.expiresAt)} /></FormField>
          <FormField label="Fin d'essai" hint="Optionnel: date de fin de l'essai."><Input name="trialEndsAt" type="date" defaultValue={formatDateInput(subscription?.trialEndsAt)} /></FormField>
          <div className="flex flex-wrap justify-end gap-3 md:col-span-2" data-responsive-actions>
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Annuler</Button>
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer l&apos;abonnement</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function PreviewColumn({ title, items, moreCount }: { title: string; items: string[]; moreCount: number }) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-dtsc-border bg-dtsc-surface/70 p-3">
      <p className="break-words text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{title}</p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="max-w-full break-words rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-ink">
            {item}
          </span>
        ))}
        {moreCount > 0 && <span className="rounded-full bg-cyan-400/14 px-2 py-1 text-[0.68rem] font-black text-cyan-600">+{moreCount}</span>}
      </div>
    </div>
  );
}
