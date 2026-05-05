"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = {
  defaultDailyMessageLimit: number;
  defaultDailyTokenLimit: number;
  chatbotEnabled: boolean;
  maintenanceMode: boolean;
  supportAutoCloseDays: number;
  allowClientAnnouncements: boolean;
};

export function AdminSettingsPanel({
  settings,
  emails,
}: {
  settings: Settings;
  emails: string[];
}) {
  const router = useRouter();
  const [settingsMessage, setSettingsMessage] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      defaultDailyMessageLimit: form.get("defaultDailyMessageLimit"),
      defaultDailyTokenLimit: form.get("defaultDailyTokenLimit"),
      supportAutoCloseDays: form.get("supportAutoCloseDays"),
      chatbotEnabled: form.get("chatbotEnabled") === "on",
      maintenanceMode: form.get("maintenanceMode") === "on",
      allowClientAnnouncements: form.get("allowClientAnnouncements") === "on",
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

  async function broadcast(event: React.FormEvent<HTMLFormElement>) {
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
      const subject = encodeURIComponent(String(payload.title || ""));
      const mailBody = encodeURIComponent(String(payload.body || ""));
      const bcc = encodeURIComponent((body?.emails || emails).join(","));
      window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${mailBody}`;
      setBroadcastMessage("Notification créée et client email ouvert.");
      form.reset();
    } else {
      setBroadcastMessage("Impossible d'envoyer la diffusion.");
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="dtsc-card p-6">
        <h2 className="font-black text-dtsc-ink">Paramètres globaux</h2>
        <p className="mt-1 text-sm text-dtsc-muted">Réglages appliqués aux futurs comptes et, si demandé, aux comptes existants.</p>
        <form onSubmit={saveSettings} className="mt-5 grid gap-4 md:grid-cols-2">
          <Input name="defaultDailyMessageLimit" type="number" defaultValue={settings.defaultDailyMessageLimit} min={1} max={1000} />
          <Input name="defaultDailyTokenLimit" type="number" defaultValue={settings.defaultDailyTokenLimit} min={1000} max={2000000} />
          <Input name="supportAutoCloseDays" type="number" defaultValue={settings.supportAutoCloseDays} min={1} max={90} />
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
          <label className="md:col-span-2 flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
            Appliquer les limites à tous les utilisateurs existants
            <input name="applyLimitsToExistingUsers" type="checkbox" className="h-4 w-4 accent-cyan-500" />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
            {settingsMessage && <p className="text-sm font-bold text-dtsc-blue">{settingsMessage}</p>}
          </div>
        </form>
      </div>

      <div className="dtsc-card p-6">
        <h2 className="font-black text-dtsc-ink">Diffusion globale</h2>
        <p className="mt-1 text-sm text-dtsc-muted">Crée une notification pour tous les utilisateurs actifs et ouvre un email groupé en CCI.</p>
        <form onSubmit={broadcast} className="mt-5 space-y-3">
          <Input name="title" placeholder="Objet / titre" required />
          <textarea name="body" placeholder="Message à diffuser" className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Notifier et ouvrir email</Button>
          {broadcastMessage && <p className="text-sm font-bold text-dtsc-blue">{broadcastMessage}</p>}
        </form>
      </div>
    </section>
  );
}
