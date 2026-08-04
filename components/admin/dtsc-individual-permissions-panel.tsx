"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Clock3, KeyRound, RefreshCcw, ShieldMinus, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";

 type PermissionCatalogItem = {
  code: string;
  label: string;
  description: string;
  category: string;
};

type CollaboratorItem = {
  id: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  department: string | null;
  jobTitle: string | null;
  positionCode: string | null;
  account: { id: string; role: string; status: string } | null;
};

type PermissionGrant = {
  id: string;
  userId: string;
  employeeId: string | null;
  permissionCode: string;
  scopeType: string;
  scopeValue: string | null;
  effect: string;
  reason: string | null;
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type PermissionDataset = {
  catalog: PermissionCatalogItem[];
  collaborators: CollaboratorItem[];
  grants: PermissionGrant[];
};

export function DtscIndividualPermissionsPanel() {
  const [dataset, setDataset] = useState<PermissionDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [collaboratorFilter, setCollaboratorFilter] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPermission, setSelectedPermission] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/individual-permissions", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as (PermissionDataset & { message?: string }) | null;
    if (!response.ok || !body) {
      setMessage(body?.message || "Chargement des permissions individuelles impossible.");
      setLoading(false);
      return;
    }
    setDataset(body);
    setSelectedUserId((current) => current || body.collaborators.find((item) => item.userId)?.userId || "");
    setSelectedPermission((current) => current || body.catalog[0]?.code || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => ["ALL", ...new Set((dataset?.catalog || []).map((item) => item.category))],
    [dataset?.catalog],
  );
  const visiblePermissions = useMemo(
    () => (dataset?.catalog || []).filter((item) => selectedCategory === "ALL" || item.category === selectedCategory),
    [dataset?.catalog, selectedCategory],
  );
  const visibleCollaborators = useMemo(() => {
    const query = collaboratorFilter.trim().toLocaleLowerCase();
    if (!query) return dataset?.collaborators || [];
    return (dataset?.collaborators || []).filter((item) =>
      [item.fullName, item.email, item.department, item.jobTitle, item.positionCode]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [collaboratorFilter, dataset?.collaborators]);
  const activeGrants = useMemo(
    () => (dataset?.grants || []).filter((grant) => !grant.revokedAt),
    [dataset?.grants],
  );
  const collaboratorsByUser = useMemo(
    () => new Map((dataset?.collaborators || []).filter((item) => item.userId).map((item) => [item.userId as string, item])),
    [dataset?.collaborators],
  );
  const permissionsByCode = useMemo(
    () => new Map((dataset?.catalog || []).map((item) => [item.code, item])),
    [dataset?.catalog],
  );

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId || !selectedPermission) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const expiresOn = String(form.get("expiresOn") || "");
    const response = await fetch("/api/admin/individual-permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selectedUserId,
        permissionCode: selectedPermission,
        scopeType: "GLOBAL",
        effect: String(form.get("effect") || "ALLOW"),
        reason: String(form.get("reason") || ""),
        validUntil: expiresOn ? new Date(`${expiresOn}T23:59:59.999Z`).toISOString() : "",
      }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Permission individuelle enregistrée." : body?.message || "Enregistrement impossible.");
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
    setSaving(false);
  }

  async function revoke(grantId: string) {
    const reason = window.prompt("Motif obligatoire de révocation")?.trim();
    if (!reason) return;
    setSaving(true);
    const response = await fetch("/api/admin/individual-permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId, reason }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Permission révoquée." : body?.message || "Révocation impossible.");
    if (response.ok) await load();
    setSaving(false);
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-600">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-600">Permissions individuelles DTSC</p>
            <h2 className="mt-1 break-words text-2xl font-black text-dtsc-ink">Accorder un acte précis sans changer le rôle global</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
              Chaque dérogation est nominative, limitée au catalogue autorisé, justifiée, révocable et journalisée. Une permission DENY individuelle prévaut sur une permission ALLOW du même code.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || saving} className="shrink-0 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
          <RefreshCcw className="h-4 w-4" /> Actualiser
        </Button>
      </div>

      {loading ? (
        <p className="mt-6 rounded-2xl border border-dtsc-border bg-dtsc-page p-5 text-sm text-dtsc-muted">Chargement des collaborateurs et permissions…</p>
      ) : (
        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <form onSubmit={grant} className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div>
              <h3 className="font-black text-dtsc-ink">Nouvelle permission</h3>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">Sélectionnez le collaborateur, l'acte autorisé, la durée et un motif professionnel.</p>
            </div>

            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Rechercher un collaborateur
              <Input value={collaboratorFilter} onChange={(event) => setCollaboratorFilter(event.target.value)} placeholder="Nom, email, poste ou département" className="h-11 rounded-xl bg-dtsc-surface" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Collaborateur
              <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} required className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                <option value="">Sélectionner</option>
                {visibleCollaborators.map((item) => (
                  <option key={item.id} value={item.userId || ""} disabled={!item.userId || item.account?.status !== "ACTIVE"}>
                    {item.fullName} · {item.jobTitle || item.positionCode || item.account?.role || "Collaborateur"}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-sm font-bold text-dtsc-ink">Catégorie</p>
              <div className="mt-2 flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label="Catégories de permissions">
                {categories.map((category) => (
                  <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${selectedCategory === category ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-surface text-dtsc-muted"}`}>
                    {category === "ALL" ? "Toutes" : category}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Permission
              <select value={selectedPermission} onChange={(event) => setSelectedPermission(event.target.value)} required className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                {visiblePermissions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
              <span className="text-xs font-normal leading-5 text-dtsc-muted">{permissionsByCode.get(selectedPermission)?.description}</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
                Effet
                <select name="effect" defaultValue="ALLOW" className="h-12 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                  <option value="ALLOW">Autoriser</option>
                  <option value="DENY">Refuser explicitement</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
                Expiration facultative
                <Input name="expiresOn" type="date" className="h-12 rounded-xl bg-dtsc-surface" />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Motif obligatoire
              <textarea name="reason" required minLength={3} maxLength={800} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" placeholder="Besoin métier, durée et responsabilité accordée" />
            </label>
            <Button type="submit" disabled={saving || !selectedUserId || !selectedPermission} className="w-full rounded-xl bg-dtsc-navy text-white">
              <UserRoundCheck className="h-4 w-4" /> Enregistrer la permission
            </Button>
          </form>

          <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-dtsc-ink">Permissions actives</h3>
                <p className="mt-1 text-xs text-dtsc-muted">{activeGrants.length} permission(s) nominative(s) active(s)</p>
              </div>
              <Clock3 className="h-5 w-5 text-cyan-600" />
            </div>
            <div className="mt-4 max-h-[70dvh] min-w-0 space-y-3 overflow-y-auto pr-1">
              {activeGrants.map((grant) => {
                const collaborator = collaboratorsByUser.get(grant.userId);
                const permission = permissionsByCode.get(grant.permissionCode);
                return (
                  <article key={grant.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${grant.effect === "DENY" ? "bg-red-500/10 text-red-700" : "bg-emerald-500/10 text-emerald-700"}`}>{grant.effect}</span>
                          <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-black text-cyan-700">{permission?.category || grant.scopeType}</span>
                        </div>
                        <h4 className="mt-3 break-words font-black text-dtsc-ink">{permission?.label || grant.permissionCode}</h4>
                        <p className="mt-1 break-words text-sm font-bold text-dtsc-muted">{collaborator?.fullName || grant.userId}</p>
                        <p className="mt-2 break-words text-xs leading-5 text-dtsc-muted">{grant.reason || "Aucun motif enregistré"}</p>
                        <p className="mt-2 text-xs text-dtsc-muted">Valide depuis {formatDate(grant.validFrom)}{grant.validUntil ? ` · jusqu'au ${formatDate(grant.validUntil)}` : " · sans expiration"}</p>
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={() => void revoke(grant.id)} disabled={saving} className="shrink-0 rounded-xl border-red-500/30 text-red-700" aria-label="Révoquer la permission">
                        <ShieldMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                );
              })}
              {!activeGrants.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-sm text-dtsc-muted">Aucune permission individuelle active.</p> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}
