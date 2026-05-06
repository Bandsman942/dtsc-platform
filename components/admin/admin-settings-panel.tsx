"use client";

import type { FormEvent, ReactNode, RefObject } from "react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Settings = {
  defaultDailyMessageLimit: number;
  defaultDailyTokenLimit: number;
  chatbotEnabled: boolean;
  maintenanceMode: boolean;
  supportAutoCloseDays: number;
  allowClientAnnouncements: boolean;
  commentEditWindowMinutes: number;
  notificationRetentionDays: number;
  signUpOtpEnabled: boolean;
  signUpOtpExpirationMinutes: number;
};

export function AdminSettingsPanel({
  settings,
}: {
  settings: Settings;
}) {
  const router = useRouter();
  const [settingsMessage, setSettingsMessage] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [newsletterBroadcastMessage, setNewsletterBroadcastMessage] = useState("");
  const broadcastBodyRef = useRef<HTMLTextAreaElement>(null);
  const newsletterContentRef = useRef<HTMLTextAreaElement>(null);

  function insertUserPlaceholder(target: RefObject<HTMLTextAreaElement | null>) {
    const textarea = target.current;
    if (!textarea) {
      return;
    }

    const placeholder = "{user}";
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = `${before}${placeholder}${after}`;
    textarea.focus();
    const nextPosition = start + placeholder.length;
    textarea.setSelectionRange(nextPosition, nextPosition);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      defaultDailyMessageLimit: form.get("defaultDailyMessageLimit"),
      defaultDailyTokenLimit: form.get("defaultDailyTokenLimit"),
      supportAutoCloseDays: form.get("supportAutoCloseDays"),
      commentEditWindowMinutes: form.get("commentEditWindowMinutes"),
      notificationRetentionDays: form.get("notificationRetentionDays"),
      chatbotEnabled: form.get("chatbotEnabled") === "on",
      maintenanceMode: form.get("maintenanceMode") === "on",
      allowClientAnnouncements: form.get("allowClientAnnouncements") === "on",
      signUpOtpEnabled: form.get("signUpOtpEnabled") === "on",
      signUpOtpExpirationMinutes: form.get("signUpOtpExpirationMinutes"),
      applyLimitsToExistingUsers: form.get("applyLimitsToExistingUsers") === "on",
    };
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSettingsMessage(response.ok ? "Paramètres globaux enregistrés." : "Impossible d'enregistrer les paramètres.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function broadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBroadcastMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setBroadcastMessage(
        body?.zoho?.sent
          ? body.zoho.personalized
            ? "Notification créée et diffusion email personnalisée transmise aux utilisateurs actifs."
            : "Notification créée et diffusion email transmise aux utilisateurs actifs en CCI."
          : "Notification créée. Configurez l'API Zoho Mail ou le webhook mail sortant pour l'envoi direct aux destinataires."
      );
      form.reset();
    } else {
      setBroadcastMessage("Impossible d'envoyer la diffusion.");
    }
  }

  async function newsletterBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewsletterBroadcastMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admin/newsletter-broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setNewsletterBroadcastMessage(
        body?.zoho?.sent
          ? body.zoho.personalized
            ? `Email personnalisé transmis à ${body.zoho.delivered || 0} abonné(s) newsletter.`
            : `Email transmis à ${body.emails?.length || 0} abonné(s) newsletter en CCI.`
          : "Diffusion préparée. Configurez l'API Zoho Mail ou le webhook mail sortant pour envoyer directement aux abonnés."
      );
      form.reset();
    } else {
      setNewsletterBroadcastMessage("Impossible d'envoyer la diffusion newsletter.");
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="dtsc-card p-6">
        <h2 className="font-black text-dtsc-ink">Paramètres globaux</h2>
        <p className="mt-1 text-sm text-dtsc-muted">Réglages appliqués aux futurs comptes et, si demandé, aux comptes existants.</p>
        <form onSubmit={saveSettings} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Messages / jour">
            <Input name="defaultDailyMessageLimit" type="number" defaultValue={settings.defaultDailyMessageLimit} min={1} max={1000} />
          </Field>
          <Field label="Tokens / jour">
            <Input name="defaultDailyTokenLimit" type="number" defaultValue={settings.defaultDailyTokenLimit} min={1000} max={2000000} />
          </Field>
          <Field label="Auto-clôture support (jours)">
            <Input name="supportAutoCloseDays" type="number" defaultValue={settings.supportAutoCloseDays} min={1} max={90} />
          </Field>
          <Field label="Modification commentaires (minutes)">
            <Input name="commentEditWindowMinutes" type="number" defaultValue={settings.commentEditWindowMinutes} min={1} max={1440} />
          </Field>
          <Field label="Rétention notifications (jours)">
            <Input name="notificationRetentionDays" type="number" defaultValue={settings.notificationRetentionDays} min={7} max={365} />
          </Field>
          <Field label="Expiration OTP inscription (minutes)">
            <Input name="signUpOtpExpirationMinutes" type="number" defaultValue={settings.signUpOtpExpirationMinutes} min={2} max={60} />
          </Field>
          <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
            Chatbot actif
            <input name="chatbotEnabled" type="checkbox" defaultChecked={settings.chatbotEnabled} className="h-4 w-4 accent-cyan-500" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
            Mode maintenance
            <input name="maintenanceMode" type="checkbox" defaultChecked={settings.maintenanceMode} className="h-4 w-4 accent-cyan-500" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
            Clients peuvent publier annonces
            <input name="allowClientAnnouncements" type="checkbox" defaultChecked={settings.allowClientAnnouncements} className="h-4 w-4 accent-cyan-500" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
            OTP obligatoire à l&apos;inscription
            <input name="signUpOtpEnabled" type="checkbox" defaultChecked={settings.signUpOtpEnabled} className="h-4 w-4 accent-cyan-500" />
          </label>
          <label className="md:col-span-2 flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
            Appliquer les limites à tous les utilisateurs existants
            <input name="applyLimitsToExistingUsers" type="checkbox" className="h-4 w-4 accent-cyan-500" />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
          </div>
        </form>
      </div>

      <div className="dtsc-card p-6">
        <h2 className="font-black text-dtsc-ink">Diffusion utilisateurs</h2>
        <p className="mt-1 text-sm text-dtsc-muted">
          Crée une notification interne et envoie un email aux utilisateurs actifs. Ajoutez <span className="font-black text-cyan-300">{"{user}"}</span> pour remplacer automatiquement par le nom du destinataire.
        </p>
        <form onSubmit={broadcast} className="mt-5 space-y-3">
          <Input name="title" placeholder="Objet / titre" required />
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-xs text-dtsc-muted">
            <span>Variable disponible:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/10"
              onClick={() => insertUserPlaceholder(broadcastBodyRef)}
            >
              Insérer {"{user}"}
            </Button>
          </div>
          <textarea
            ref={broadcastBodyRef}
            name="body"
            placeholder="Bonjour {user},&#10;&#10;Message professionnel à diffuser..."
            className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink"
            required
          />
          <p className="text-xs leading-6 text-dtsc-muted">
            Sans <span className="font-bold text-dtsc-ink">{"{user}"}</span>, l&apos;envoi est groupé en CCI. Avec <span className="font-bold text-dtsc-ink">{"{user}"}</span>, chaque destinataire reçoit une version personnalisée.
          </p>
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Notifier et envoyer email</Button>
        </form>
      </div>

      <div className="dtsc-card p-6 xl:col-span-2">
        <h2 className="font-black text-dtsc-ink">Diffusion newsletter</h2>
        <p className="mt-1 text-sm text-dtsc-muted">
          Envoie un email aux visiteurs inscrits via le formulaire public. La variable <span className="font-black text-cyan-300">{"{user}"}</span> reprend le nom saisi lors de l&apos;inscription newsletter.
        </p>
        <form onSubmit={newsletterBroadcast} className="mt-5 grid gap-3 lg:grid-cols-[320px_1fr_auto]">
          <Input name="subject" placeholder="Objet de l'email newsletter" required />
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-xs text-dtsc-muted">
              <span>Variable disponible:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/10"
                onClick={() => insertUserPlaceholder(newsletterContentRef)}
              >
                Insérer {"{user}"}
              </Button>
            </div>
            <textarea
              ref={newsletterContentRef}
              name="content"
              placeholder="Bonjour {user},&#10;&#10;Contenu professionnel à envoyer aux abonnés newsletter..."
              className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink lg:min-h-20"
              required
            />
          </div>
          <div className="grid content-start gap-2">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Envoyer</Button>
            <p className="text-xs leading-5 text-dtsc-muted">Les destinataires restent en CCI.</p>
          </div>
        </form>
      </div>
      <Dialog open={Boolean(settingsMessage)} title="Paramètres DTSC" onClose={() => setSettingsMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{settingsMessage}</p>
      </Dialog>
      <Dialog open={Boolean(broadcastMessage)} title="Diffusion DTSC" onClose={() => setBroadcastMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{broadcastMessage}</p>
      </Dialog>
      <Dialog open={Boolean(newsletterBroadcastMessage)} title="Diffusion newsletter" onClose={() => setNewsletterBroadcastMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{newsletterBroadcastMessage}</p>
      </Dialog>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
      {label}
      {children}
    </label>
  );
}
