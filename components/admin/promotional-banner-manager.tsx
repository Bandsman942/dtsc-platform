"use client";

import type { UserRole } from "@prisma/client";
import { Archive, Eye, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { promotionalBannerSurfaces, normalizeBannerRoles, normalizeBannerSurfaces, type PromotionalBannerSurface } from "@/lib/promotional-banner-shared";
import { formatEnumLabel } from "@/lib/labels";

type BannerItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  surfacesJson: unknown;
  includeRoles: unknown;
  excludeRoles: unknown;
  ctaLabel: string | null;
  ctaUrl: string | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { dismissals: number };
};

const roleOptions: UserRole[] = ["ADMIN", "MANAGER", "SUPPORT", "CLIENT"];
const statusOptions = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

export function PromotionalBannerManager({ banners, canManage }: { banners: BannerItem[]; canManage: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"create" | "edit" | "archive" | null>(null);
  const [selectedBanner, setSelectedBanner] = useState<BannerItem | null>(null);
  const [feedback, setFeedback] = useState("");

  async function saveBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      status: String(form.get("status") || "DRAFT"),
      surfaces: form.getAll("surfaces").map(String),
      includeRoles: form.getAll("includeRoles").map(String),
      excludeRoles: form.getAll("excludeRoles").map(String),
      ctaLabel: String(form.get("ctaLabel") || "").trim(),
      ctaUrl: String(form.get("ctaUrl") || "").trim(),
      priority: String(form.get("priority") || "0"),
      startsAt: String(form.get("startsAt") || ""),
      endsAt: String(form.get("endsAt") || ""),
    };
    if (!payload.surfaces.length) {
      setFeedback("Sélectionnez au moins une surface d'affichage.");
      return;
    }
    const endpoint = dialog === "edit" && selectedBanner ? `/api/admin/promotional-banners/${encodeURIComponent(selectedBanner.id)}` : "/api/admin/promotional-banners";
    const response = await fetch(endpoint, {
      method: dialog === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setFeedback(body?.message || "Bannière non enregistrée.");
      return;
    }
    setDialog(null);
    setSelectedBanner(null);
    setFeedback(dialog === "edit" ? "Bannière promotionnelle mise à jour." : "Bannière promotionnelle créée.");
    router.refresh();
  }

  async function archiveBanner() {
    if (!canManage || !selectedBanner) return;
    const response = await fetch(`/api/admin/promotional-banners/${encodeURIComponent(selectedBanner.id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setFeedback(body?.message || "Bannière non archivée.");
      return;
    }
    setDialog(null);
    setSelectedBanner(null);
    setFeedback("Bannière promotionnelle archivée.");
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Messages ciblés DTSC</p>
          <h2 className="mt-1 break-words text-2xl font-black text-dtsc-ink">Bannières promotionnelles</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">Gérez les messages courts affichés dans Chatbot, IA Assistant Entreprise, Mes collaborateurs et Annonces.</p>
        </div>
        <Button type="button" disabled={!canManage} onClick={() => { setSelectedBanner(null); setDialog("create"); }} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <Plus className="h-4 w-4" /> Nouvelle bannière
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {banners.map((banner) => {
          const surfaces = normalizeBannerSurfaces(banner.surfacesJson);
          const includeRoles = normalizeBannerRoles(banner.includeRoles);
          const excludeRoles = normalizeBannerRoles(banner.excludeRoles);
          return (
            <article key={banner.id} className="relative min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 pr-14 shadow-[0_14px_40px_rgba(0,43,91,0.08)]">
              <div className="absolute right-3 top-3">
                <ActionMenu
                  items={[
                    { key: "edit", label: "Modifier", icon: Pencil, onSelect: () => { setSelectedBanner(banner); setDialog("edit"); }, disabled: !canManage },
                    { key: "archive", label: "Archiver", icon: Trash2, destructive: true, onSelect: () => { setSelectedBanner(banner); setDialog("archive"); }, disabled: !canManage || Boolean(banner.archivedAt) },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={banner.status === "ACTIVE" ? "green" : banner.status === "ARCHIVED" ? "red" : "cyan"}>{formatEnumLabel(banner.status)}</Badge>
                <Badge>{banner.priority} priorité</Badge>
                <Badge>{banner._count?.dismissals || 0} fermeture(s)</Badge>
              </div>
              <h3 className="mt-3 break-words text-lg font-black text-dtsc-ink">{banner.title}</h3>
              <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">{banner.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {surfaces.map((surface) => <Badge key={surface}>{surfaceLabel(surface)}</Badge>)}
              </div>
              <div className="mt-3 grid gap-2 text-xs font-bold text-dtsc-muted sm:grid-cols-2">
                <p className="rounded-xl bg-dtsc-page p-2">Inclus: {includeRoles.length ? includeRoles.map(formatEnumLabel).join(", ") : "Tous les rôles"}</p>
                <p className="rounded-xl bg-dtsc-page p-2">Exclus: {excludeRoles.length ? excludeRoles.map(formatEnumLabel).join(", ") : "Aucun"}</p>
              </div>
              {(banner.ctaLabel || banner.ctaUrl) && (
                <p className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-cyan-400/10 p-2 text-xs font-black text-cyan-700">
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{banner.ctaLabel || "Lien"} · {banner.ctaUrl || "URL non définie"}</span>
                </p>
              )}
            </article>
          );
        })}
        {!banners.length && (
          <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5 text-sm text-dtsc-muted">Aucune bannière promotionnelle configurée.</p>
        )}
      </div>

      <Dialog
        open={dialog === "create" || dialog === "edit"}
        title={dialog === "edit" ? "Modifier la bannière" : "Créer une bannière"}
        description="Le message est court, dismissible et ciblé par rôle utilisateur."
        onClose={() => { setDialog(null); setSelectedBanner(null); }}
        className="max-w-4xl"
      >
        <BannerForm banner={selectedBanner} canManage={canManage} onSubmit={saveBanner} />
      </Dialog>

      <Dialog
        open={dialog === "archive"}
        title="Archiver la bannière"
        description="La bannière ne sera plus affichée aux utilisateurs."
        onClose={() => { setDialog(null); setSelectedBanner(null); }}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => { setDialog(null); setSelectedBanner(null); }}>Annuler</Button>
            <Button type="button" variant="destructive" onClick={archiveBanner}><Archive className="h-4 w-4" /> Archiver</Button>
          </>
        )}
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez l&apos;archivage de {selectedBanner?.title}.</p>
      </Dialog>

      <Dialog open={Boolean(feedback)} title="Bannières promotionnelles" onClose={() => setFeedback("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{feedback}</p>
      </Dialog>
    </section>
  );
}

function BannerForm({ banner, canManage, onSubmit }: { banner: BannerItem | null; canManage: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const surfaces = normalizeBannerSurfaces(banner?.surfacesJson);
  const includeRoles = normalizeBannerRoles(banner?.includeRoles);
  const excludeRoles = normalizeBannerRoles(banner?.excludeRoles);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
      <Field label="Titre principal">
        <Input name="title" defaultValue={banner?.title || ""} required maxLength={90} disabled={!canManage} placeholder="Add your birthday!" />
      </Field>
      <Field label="Statut">
        <select name="status" defaultValue={banner?.status || "DRAFT"} disabled={!canManage} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
          {statusOptions.map((status) => <option key={status} value={status}>{formatEnumLabel(status)}</option>)}
        </select>
      </Field>
      <Field label="Sous-texte" className="lg:col-span-2">
        <textarea name="description" defaultValue={banner?.description || ""} required maxLength={180} disabled={!canManage} placeholder="Let your contacts know..." className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      </Field>
      <Field label="Surfaces d'affichage" className="lg:col-span-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {promotionalBannerSurfaces.map((surface) => (
            <CheckOption key={surface.id} name="surfaces" value={surface.id} label={surface.label} defaultChecked={surfaces.includes(surface.id)} disabled={!canManage} />
          ))}
        </div>
      </Field>
      <Field label="Inclure ces rôles">
        <div className="grid gap-2">
          {roleOptions.map((role) => <CheckOption key={role} name="includeRoles" value={role} label={formatEnumLabel(role)} defaultChecked={includeRoles.includes(role)} disabled={!canManage} />)}
        </div>
      </Field>
      <Field label="Exclure ces rôles">
        <div className="grid gap-2">
          {roleOptions.map((role) => <CheckOption key={role} name="excludeRoles" value={role} label={formatEnumLabel(role)} defaultChecked={excludeRoles.includes(role)} disabled={!canManage} />)}
        </div>
      </Field>
      <Field label="Label CTA">
        <Input name="ctaLabel" defaultValue={banner?.ctaLabel || ""} maxLength={48} disabled={!canManage} placeholder="Découvrir" />
      </Field>
      <Field label="URL CTA">
        <Input name="ctaUrl" defaultValue={banner?.ctaUrl || ""} maxLength={500} disabled={!canManage} placeholder="/billing" />
      </Field>
      <Field label="Priorité">
        <Input name="priority" type="number" min={0} max={100} defaultValue={banner?.priority ?? 0} disabled={!canManage} />
      </Field>
      <Field label="Début">
        <Input name="startsAt" type="datetime-local" defaultValue={toLocalDateTimeValue(banner?.startsAt)} disabled={!canManage} />
      </Field>
      <Field label="Fin">
        <Input name="endsAt" type="datetime-local" defaultValue={toLocalDateTimeValue(banner?.endsAt)} disabled={!canManage} />
      </Field>
      <div className="flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/10 p-3 text-xs font-bold text-cyan-700">
        <Shield className="h-4 w-4 shrink-0" />
        Les rôles exclus priment toujours sur les rôles inclus.
      </div>
      <div className="lg:col-span-2">
        <Button disabled={!canManage} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
      </div>
    </form>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted ${className}`}>
      {label}
      {children}
    </label>
  );
}

function CheckOption({ name, value, label, defaultChecked, disabled }: { name: string; value: string; label: string; defaultChecked: boolean; disabled: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm font-bold normal-case tracking-normal text-dtsc-ink">
      <span className="min-w-0 truncate">{label}</span>
      <input name={name} value={value} type="checkbox" defaultChecked={defaultChecked} disabled={disabled} className="h-4 w-4 shrink-0 accent-cyan-500" />
    </label>
  );
}

function Badge({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "green" | "red" }) {
  const toneClass = tone === "green" ? "bg-emerald-400/15 text-emerald-700" : tone === "red" ? "bg-red-400/15 text-red-700" : "bg-cyan-400/15 text-cyan-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[0.68rem] font-black uppercase ${toneClass}`}>{children}</span>;
}

function surfaceLabel(surface: PromotionalBannerSurface) {
  return promotionalBannerSurfaces.find((item) => item.id === surface)?.label || surface;
}

function toLocalDateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
