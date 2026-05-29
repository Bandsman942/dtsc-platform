"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { formatEnumLabel } from "@/lib/labels";

export function CreateUserForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setMessage(response.ok ? "Compte utilisateur créé." : "Impossible de créer ce compte.");
    if (response.ok) {
      event.currentTarget.reset();
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-dtsc-muted">Créez un compte avec rôle, limites d&apos;usage et coordonnées contrôlées.</p>
        <Button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <UserPlus className="h-4 w-4" />
          Créer le compte
        </Button>
      </div>
      {message && <p className="mt-3 text-sm font-bold text-dtsc-blue">{message}</p>}
      <Dialog open={open} title="Créer un compte utilisateur" description="Renseignez les informations nécessaires au compte. Les limites d'usage sont appliquées côté serveur." onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <FormField label="Nom complet" hint="Nom affiché dans l'application et les notifications.">
            <Input name="name" placeholder="Nom complet" required />
          </FormField>
          <FormField label="Email" hint="Adresse de connexion unique de l'utilisateur.">
            <Input name="email" type="email" placeholder="Email" required />
          </FormField>
          <FormField label="Mot de passe temporaire" hint="L'utilisateur devra le remplacer selon la politique interne.">
            <PasswordInput name="password" placeholder="Mot de passe temporaire" autoComplete="new-password" required />
          </FormField>
          <FormField label="Rôle global" hint="Définit les droits plateforme globaux, sans passe-droit sur les entreprises clientes.">
            <select name="role" className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
              <option value="CLIENT">{formatEnumLabel("CLIENT")}</option>
              <option value="SUPPORT">{formatEnumLabel("SUPPORT")}</option>
              <option value="MANAGER">{formatEnumLabel("MANAGER")}</option>
              <option value="ADMIN">{formatEnumLabel("ADMIN")}</option>
            </select>
          </FormField>
          <FormField label="Entreprise" hint="Information de profil, différente du rattachement officiel à une organisation.">
            <Input name="companyName" placeholder="Entreprise" />
          </FormField>
          <FormField label="Téléphone" hint="Coordonnée utile pour support et qualification.">
            <Input name="phone" placeholder="Téléphone" />
          </FormField>
          <FormField label="Limite messages/jour" hint="Nombre maximum de messages IA par jour pour ce compte.">
            <Input name="dailyMessageLimit" type="number" defaultValue={30} min={1} max={1000} />
          </FormField>
          <FormField label="Limite tokens/jour" hint="Budget quotidien maximal en tokens pour ce compte.">
            <Input name="dailyTokenLimit" type="number" defaultValue={100000} min={1000} max={2000000} />
          </FormField>
          <div className="md:col-span-2">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <UserPlus className="h-4 w-4" />
              Créer le compte
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
